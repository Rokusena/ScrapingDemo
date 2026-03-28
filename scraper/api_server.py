#!/usr/bin/env python3
"""
GaukDarba — Lightweight API server for on-demand pipeline triggers.

Exposes:
  POST /scan-now       — start a background scan for a user, returns scan_id
  GET  /scan-status    — poll scan progress by scan_id
  GET  /health         — healthcheck

Required env vars (same as main.py):
  SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY, RESEND_API_KEY
  API_SECRET — shared secret for authenticating requests from the webapp
"""

import json
import logging
import os
import sys
import threading
import time as _time
import traceback
import uuid
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from supabase import create_client

# ── Config ────────────────────────────────────────────────────────────────────

API_SECRET = os.environ.get("API_SECRET", "")
PORT = int(os.environ.get("API_PORT", "8080"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  [%(name)s]  %(message)s",
    datefmt="%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("gaukdarba.api")

# ── Scan state tracking ──────────────────────────────────────────────────────

_scans: dict[str, dict] = {}        # scan_id → {status, result, user_id, started_at}
_user_running: dict[str, str] = {}  # user_id → scan_id (one active scan per user)
_state_lock = threading.Lock()


def _cleanup_old_scans():
    """Remove scan entries older than 1 hour. Call while holding _state_lock."""
    cutoff = _time.time() - 3600
    expired = [sid for sid, s in _scans.items() if s.get("started_at", 0) < cutoff]
    for sid in expired:
        scan = _scans.pop(sid, None)
        if scan:
            _user_running.pop(scan["user_id"], None)


# ── Pipeline runner (single user, stages 2-4) ────────────────────────────────

def run_pipeline_for_user(user_id: str, skip_email: bool = False) -> dict:
    """Run stages 2-4 for a single user. Returns summary dict."""
    from supabase import create_client as _create

    SUPABASE_URL = os.environ["SUPABASE_URL"]
    SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
    supabase = _create(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Delete old matches for this user to start fresh
    supabase.table("matches").delete().eq("user_id", user_id).execute()
    log.info("Deleted old matches for user %s", user_id[:8])

    # Load user preferences
    prefs_res = (
        supabase.table("job_preferences")
        .select("user_id, desired_position, skills, preferred_cities, "
                "preferred_salary_min, experience_level, languages, keywords")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .execute()
    )
    if not prefs_res.data:
        return {"error": "No active preferences found", "matches_found": 0}

    profile_res = (
        supabase.table("profiles")
        .select("id, email")
        .eq("id", user_id)
        .single()
        .execute()
    )
    if not profile_res.data:
        return {"error": "User profile not found", "matches_found": 0}

    user = {**profile_res.data, "preferences": prefs_res.data[0]}

    # Stage 2: Title matcher
    from openai import OpenAI
    from title_matcher import match_user
    openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    log.info("Stage 2: Title matching for user %s", user_id[:8])
    job_ids = match_user(openai_client, supabase, user)
    log.info("Stage 2 complete: %d title matches", len(job_ids))

    if not job_ids:
        return {"matches_found": 0, "top_match": None}

    # Stage 3: Detail scraper
    from detail_scraper import scrape_details
    job_map = {user_id: job_ids}
    log.info("Stage 3: Scraping %d job details", len(job_ids))
    scrape_details(job_map)

    # Stage 4: Detail matcher (skip email for on-demand scans)
    from detail_matcher import match_user as detail_match_user
    log.info("Stage 4: Detail matching")
    detail_match_user(openai_client, supabase, user, send_email=not skip_email)

    # Cleanup: delete garbage matches
    supabase.table("matches").delete().eq("user_id", user_id).lte("detail_score", 2).execute()

    # Fetch final results
    matches_res = (
        supabase.table("matches")
        .select("*, raw_listings(*)")
        .eq("user_id", user_id)
        .not_.is_("detail_score", "null")
        .gte("detail_score", 3)
        .order("detail_score", desc=True)
        .limit(5)
        .execute()
    )
    final_matches = matches_res.data or []

    top_match = None
    if final_matches:
        top = final_matches[0]
        listing = top.get("raw_listings") or {}
        top_match = {
            "title": listing.get("title"),
            "company": listing.get("company"),
            "score": top.get("detail_score"),
        }

    return {
        "matches_found": len(final_matches),
        "top_match": top_match,
    }


def _run_scan_background(user_id: str, scan_id: str):
    """Run pipeline in background thread, updating scan state on completion."""
    try:
        result = run_pipeline_for_user(user_id, skip_email=True)
        with _state_lock:
            _scans[scan_id]["status"] = "complete"
            _scans[scan_id]["result"] = result
        log.info("Scan %s complete: %s", scan_id[:8], result)
    except Exception:
        log.error("Scan %s failed:\n%s", scan_id[:8], traceback.format_exc())
        with _state_lock:
            _scans[scan_id]["status"] = "failed"
            _scans[scan_id]["result"] = {"error": "Pipeline failed"}
    finally:
        with _state_lock:
            _user_running.pop(user_id, None)


# ── HTTP Handler ──────────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/scan-now":
            self._handle_scan_now()
        else:
            self._respond(404, {"error": "Not found"})

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self._respond(200, {"status": "ok"})
        elif parsed.path == "/scan-status":
            params = parse_qs(parsed.query)
            self._handle_scan_status(params)
        else:
            self._respond(404, {"error": "Not found"})

    def _check_auth(self) -> bool:
        """Return True if authorized, otherwise send 401 and return False."""
        auth = self.headers.get("Authorization", "")
        if API_SECRET and auth != f"Bearer {API_SECRET}":
            self._respond(401, {"error": "Unauthorized"})
            return False
        return True

    def _handle_scan_now(self):
        if not self._check_auth():
            return

        # Parse body
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length else b"{}"
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._respond(400, {"error": "Invalid JSON"})
            return

        user_id = data.get("user_id")
        if not user_id:
            self._respond(400, {"error": "user_id required"})
            return

        log.info("Scan-now request for user %s", user_id[:8])

        with _state_lock:
            _cleanup_old_scans()

            # Reject if user already has a running scan
            existing = _user_running.get(user_id)
            if existing and _scans.get(existing, {}).get("status") == "running":
                log.info("Scan already running for user %s (scan %s)", user_id[:8], existing[:8])
                self._respond(409, {
                    "error": "Skenavimas jau vyksta",
                    "scan_id": existing,
                    "status": "running",
                })
                return

            scan_id = str(uuid.uuid4())
            _scans[scan_id] = {
                "status": "running",
                "result": None,
                "user_id": user_id,
                "started_at": _time.time(),
            }
            _user_running[user_id] = scan_id

        thread = threading.Thread(
            target=_run_scan_background,
            args=(user_id, scan_id),
            daemon=True,
        )
        thread.start()

        self._respond(202, {"scan_id": scan_id, "status": "started"})

    def _handle_scan_status(self, params: dict):
        if not self._check_auth():
            return

        scan_id = (params.get("scan_id") or [""])[0]
        if not scan_id:
            self._respond(400, {"error": "scan_id required"})
            return

        with _state_lock:
            scan = _scans.get(scan_id)

        if not scan:
            self._respond(404, {"error": "Scan not found"})
            return

        self._respond(200, {
            "status": scan["status"],
            "result": scan["result"],
        })

    def _respond(self, status: int, body: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def log_message(self, format, *args):
        # Suppress default logging; we use our own
        pass


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    log.info("GaukDarba API server listening on port %d", PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down")
        server.server_close()

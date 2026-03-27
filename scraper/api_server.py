#!/usr/bin/env python3
"""
GaukDarba — Lightweight API server for on-demand pipeline triggers.

Exposes POST /scan-now to run Stages 2-4 for a single user.
Meant to run alongside the cron job (main.py).

Required env vars (same as main.py):
  SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY, RESEND_API_KEY
  API_SECRET — shared secret for authenticating requests from the webapp
"""

import json
import logging
import os
import sys
import traceback
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler

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


# ── Pipeline runner (single user, stages 2-4) ────────────────────────────────

def run_pipeline_for_user(user_id: str) -> dict:
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
    from title_matcher import match_user, load_active_users
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

    # Stage 4: Detail matcher
    from detail_matcher import match_user as detail_match_user
    log.info("Stage 4: Detail matching")
    scored = detail_match_user(openai_client, supabase, user)

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


# ── HTTP Handler ──────────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/scan-now":
            self._handle_scan_now()
        else:
            self._respond(404, {"error": "Not found"})

    def do_GET(self):
        if self.path == "/health":
            self._respond(200, {"status": "ok"})
        else:
            self._respond(404, {"error": "Not found"})

    def _handle_scan_now(self):
        # Auth check
        auth = self.headers.get("Authorization", "")
        if API_SECRET and auth != f"Bearer {API_SECRET}":
            self._respond(401, {"error": "Unauthorized"})
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
        try:
            result = run_pipeline_for_user(user_id)
            self._respond(200, result)
        except Exception:
            log.error("Scan-now failed:\n%s", traceback.format_exc())
            self._respond(500, {"error": "Pipeline failed"})

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

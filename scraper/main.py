#!/usr/bin/env python3
"""
GaukDarba — Full pipeline runner

Stages:
  1. scrape          → upserts all CVBankas listings into raw_listings
  2. title_matcher   → LLM picks ~100 relevant jobs per user (title-level)
  3. detail_scraper  → fetches full job pages for those ~100 jobs
  4. detail_matcher  → LLM deep-scores and emails top results

Error strategy:
  • Each stage is isolated — a crash in stage N does not abort stage N+1.
  • If the scraper fails (or scraped 0 listings today), the matchers continue
    against whatever is already in the DB (yesterday's data if present).
  • Per-user failures inside title_matcher / detail_matcher are already handled
    inside those modules; a single bad user never blocks others.
  • Any uncaught exception in a stage is logged and the pipeline moves on.

Required env vars (same set as individual scripts):
  SUPABASE_URL, SUPABASE_SERVICE_KEY
  OPENAI_API_KEY
  RESEND_API_KEY
"""

import logging
import os
import sys
import time
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from supabase import create_client

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  [%(name)s]  %(message)s",
    datefmt="%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("gaukdarba.main")

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL         = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

# GPT-4o-mini pricing ($ per token, as of 2024-Q2)
_INPUT_COST_PER_TOKEN  = 0.150 / 1_000_000
_OUTPUT_COST_PER_TOKEN = 0.600 / 1_000_000


# ── Metrics container ─────────────────────────────────────────────────────────

@dataclass
class PipelineMetrics:
    run_date:          str   = ""
    listings_scraped:  int   = 0
    users_processed:   int   = 0
    title_matches:     int   = 0
    detail_jobs:       int   = 0   # unique job_ids sent to detail scraper
    detail_scored:     int   = 0   # matches that got a detail_score today
    emails_sent:       int   = 0
    total_seconds:     float = 0.0
    stage_errors:      list  = field(default_factory=list)

    # openai cost estimate inputs
    _listings:         int   = 0
    _users:            int   = 0
    _avg_matches:      int   = 0

    def openai_cost_estimate(self) -> float:
        """
        Rough GPT-4o-mini cost estimate based on data volume.

        Title matching:
          • Input per batch (200 titles):  300 (profile) + 200×25 (titles) = 5_300 tokens
          • Output per batch:              100×20 = 2_000 tokens
        Detail matching:
          • Input per batch (20 jobs):     300 (profile) + 20×600 (desc) = 12_300 tokens
          • Output per batch:              20×30 = 600 tokens
        """
        if self._listings == 0 or self._users == 0:
            return 0.0

        title_batches = -(-self._listings // 200) * self._users       # ceil
        detail_batches = -(-max(self._avg_matches, 1) // 20) * self._users

        input_tokens  = title_batches * 5_300  + detail_batches * 12_300
        output_tokens = title_batches * 2_000  + detail_batches * 600

        return round(input_tokens * _INPUT_COST_PER_TOKEN
                     + output_tokens * _OUTPUT_COST_PER_TOKEN, 4)


# ── Supabase metric queries ───────────────────────────────────────────────────

def _today_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _count_todays_listings(supabase) -> int:
    today = _today_iso()
    res = (
        supabase.table("raw_listings")
        .select("id", count="exact")
        .gte("scraped_at", f"{today}T00:00:00+00:00")
        .execute()
    )
    return res.count or 0


def _count_todays_matches(supabase) -> int:
    today = _today_iso()
    res = (
        supabase.table("matches")
        .select("id", count="exact")
        .gte("matched_at", f"{today}T00:00:00+00:00")
        .execute()
    )
    return res.count or 0


def _count_todays_detail_scored(supabase) -> int:
    today = _today_iso()
    res = (
        supabase.table("matches")
        .select("id", count="exact")
        .not_.is_("detail_score", "null")
        .gte("matched_at", f"{today}T00:00:00+00:00")
        .execute()
    )
    return res.count or 0


def _count_todays_emails(supabase) -> int:
    """Count unique users that received a notification email today."""
    today = _today_iso()
    res = (
        supabase.table("matches")
        .select("user_id")
        .eq("notified", True)
        .gte("matched_at", f"{today}T00:00:00+00:00")
        .execute()
    )
    rows = res.data or []
    return len({r["user_id"] for r in rows})


def _has_any_listings(supabase, days_back: int = 1) -> bool:
    """Return True if there are listings from within the last N days."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()
    res = (
        supabase.table("raw_listings")
        .select("id", count="exact")
        .gte("scraped_at", cutoff)
        .execute()
    )
    return (res.count or 0) > 0


# ── Stage runners ─────────────────────────────────────────────────────────────

def run_scraper(metrics: PipelineMetrics, supabase) -> bool:
    """
    Stage 1: scrape all CVBankas listings.
    Returns True on success, False on failure.
    On failure the matchers will use whatever is already in the DB.
    """
    log.info("━━━  Stage 1/4: Scraper  ━━━")
    t = time.time()
    try:
        from scrape import run as _scrape
        _scrape()
        metrics.listings_scraped = _count_todays_listings(supabase)
        log.info("Stage 1 ✓  listings scraped today: %d  (%.1fs)",
                 metrics.listings_scraped, time.time() - t)
        return True

    except Exception:
        log.error("Stage 1 FAILED after %.1fs — continuing with DB data:\n%s",
                  time.time() - t, traceback.format_exc())
        metrics.stage_errors.append("scraper")

        # Check if yesterday's data is available so matchers aren't running blind
        metrics.listings_scraped = _count_todays_listings(supabase)
        if metrics.listings_scraped == 0 and _has_any_listings(supabase, days_back=2):
            log.warning("No today's listings in DB. Matchers will use yesterday's data "
                        "(title_matcher filters by scraped_at=today — expect 0 new matches).")
        return False


def run_title_matcher(metrics: PipelineMetrics) -> dict[str, list[str]]:
    """
    Stage 2: LLM title-level matching.
    Returns job_map {user_id: [job_ids]} on success, {} on failure.
    Per-user errors are handled internally; only a total crash returns {}.
    """
    log.info("━━━  Stage 2/4: Title matcher  ━━━")
    t = time.time()
    try:
        from title_matcher import run as _title_match
        job_map: dict[str, list[str]] = _title_match()

        metrics.users_processed = len(job_map)
        metrics.title_matches   = sum(len(v) for v in job_map.values())
        # Store for cost estimation
        metrics._users          = metrics.users_processed
        metrics._listings       = metrics.listings_scraped
        metrics._avg_matches    = (
            metrics.title_matches // metrics.users_processed
            if metrics.users_processed else 0
        )

        log.info("Stage 2 ✓  users=%d  title_matches=%d  (%.1fs)",
                 metrics.users_processed, metrics.title_matches, time.time() - t)
        return job_map

    except Exception:
        log.error("Stage 2 FAILED after %.1fs — skipping detail scrape:\n%s",
                  time.time() - t, traceback.format_exc())
        metrics.stage_errors.append("title_matcher")
        return {}


def run_detail_scraper(job_map: dict[str, list[str]], metrics: PipelineMetrics) -> None:
    """
    Stage 3: fetch full job description pages for title-matched jobs.
    Runs only if job_map is non-empty.
    """
    if not job_map:
        log.info("━━━  Stage 3/4: Detail scraper  ━━━  (skipped — no job_map)")
        return

    metrics.detail_jobs = len({jid for ids in job_map.values() for jid in ids})
    log.info("━━━  Stage 3/4: Detail scraper  ━━━  (%d unique jobs)", metrics.detail_jobs)
    t = time.time()
    try:
        from detail_scraper import scrape_details as _scrape_details
        _scrape_details(job_map)
        log.info("Stage 3 ✓  (%.1fs)", time.time() - t)

    except Exception:
        log.error("Stage 3 FAILED after %.1fs — detail_matcher will score "
                  "only jobs that had details saved:\n%s",
                  time.time() - t, traceback.format_exc())
        metrics.stage_errors.append("detail_scraper")


def run_detail_matcher(metrics: PipelineMetrics, supabase) -> None:
    """
    Stage 4: LLM deep-scoring + email notifications.
    Per-user errors are handled internally; only a total crash is caught here.
    """
    log.info("━━━  Stage 4/4: Detail matcher + email  ━━━")
    t = time.time()
    try:
        from detail_matcher import run as _detail_match
        _detail_match()

        metrics.detail_scored = _count_todays_detail_scored(supabase)
        metrics.emails_sent   = _count_todays_emails(supabase)
        log.info("Stage 4 ✓  detail_scored=%d  emails=%d  (%.1fs)",
                 metrics.detail_scored, metrics.emails_sent, time.time() - t)

    except Exception:
        log.error("Stage 4 FAILED after %.1fs:\n%s",
                  time.time() - t, traceback.format_exc())
        metrics.stage_errors.append("detail_matcher")


# ── Summary ───────────────────────────────────────────────────────────────────

def print_summary(metrics: PipelineMetrics) -> None:
    h, rem = divmod(int(metrics.total_seconds), 3600)
    m, s   = divmod(rem, 60)
    duration = f"{h}h {m}m {s}s" if h else f"{m}m {s}s"

    cost = metrics.openai_cost_estimate()

    bar = "═" * 55
    log.info(bar)
    log.info("  GaukDarba pipeline summary — %s", metrics.run_date)
    log.info(bar)
    log.info("  Listings scraped     : %d", metrics.listings_scraped)
    log.info("  Users processed      : %d", metrics.users_processed)
    log.info("  Title matches        : %d", metrics.title_matches)
    log.info("  Detail jobs scraped  : %d", metrics.detail_jobs)
    log.info("  Detail scored        : %d", metrics.detail_scored)
    log.info("  Emails sent          : %d", metrics.emails_sent)
    log.info("  Total time           : %s", duration)
    log.info("  OpenAI cost estimate : ~$%.4f", cost)
    if metrics.stage_errors:
        log.warning("  Failed stages        : %s", ", ".join(metrics.stage_errors))
    else:
        log.info("  Failed stages        : none")
    log.info(bar)

    # Machine-readable JSON summary to stdout for Railway log parsing
    import json
    print(json.dumps({
        "run_date":           metrics.run_date,
        "listings_scraped":   metrics.listings_scraped,
        "users_processed":    metrics.users_processed,
        "title_matches":      metrics.title_matches,
        "detail_scored":      metrics.detail_scored,
        "emails_sent":        metrics.emails_sent,
        "total_seconds":      round(metrics.total_seconds, 1),
        "openai_cost_usd":    cost,
        "stage_errors":       metrics.stage_errors,
        "success":            len(metrics.stage_errors) == 0,
    }, indent=2))


# ── Main ──────────────────────────────────────────────────────────────────────

# RUN_MODE controls which stages execute:
#   "scraper"  — Stage 1 only  (run once a day at 04:00 Lithuania time)
#   "matcher"  — Stages 2-4    (run every hour)
#   "full"     — All stages    (default, for manual / legacy use)
RUN_MODE = os.environ.get("RUN_MODE", "full").lower()


def main() -> int:
    """
    Run the pipeline. Returns exit code:
      0 — all stages succeeded
      1 — one or more stages failed (pipeline still completed)
      2 — fatal error before pipeline could start
    """
    wall_start = time.time()
    metrics    = PipelineMetrics(
        run_date=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    )

    log.info("╔══════════════════════════════════════════════════════╗")
    log.info("║        GaukDarba pipeline starting  (mode: %-8s)║", RUN_MODE)
    log.info("║        %s                        ║", metrics.run_date)
    log.info("╚══════════════════════════════════════════════════════╝")

    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    except Exception:
        log.critical("Cannot connect to Supabase — aborting:\n%s", traceback.format_exc())
        return 2

    # ── Run stages based on mode ──────────────────────────────────────────
    if RUN_MODE == "scraper":
        run_scraper(metrics, supabase)

    elif RUN_MODE == "matcher":
        # Matchers run against whatever is already in the DB (scraped earlier today)
        metrics.listings_scraped = _count_todays_listings(supabase)
        job_map = run_title_matcher(metrics)
        run_detail_scraper(job_map, metrics)
        run_detail_matcher(metrics, supabase)

    else:  # "full" or unrecognised — run everything
        run_scraper(metrics, supabase)
        job_map = run_title_matcher(metrics)
        run_detail_scraper(job_map, metrics)
        run_detail_matcher(metrics, supabase)
    # ─────────────────────────────────────────────────────────────────────

    metrics.total_seconds = time.time() - wall_start
    print_summary(metrics)

    return 1 if metrics.stage_errors else 0


if __name__ == "__main__":
    sys.exit(main())

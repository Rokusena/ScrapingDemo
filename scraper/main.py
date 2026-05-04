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
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

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

        Title matching (3-layer funnel — only ~50-100 listings reach LLM):
          • Input per batch (25 titles):   500 (system) + 25×25 (titles) = 1_125 tokens
          • Output per batch:              ~10×20 = 200 tokens
          • Estimated survivors reaching LLM: ~80 per user (after SQL + keyword filter)
        Detail matching:
          • Input per batch (20 jobs):     300 (profile) + 20×600 (desc) = 12_300 tokens
          • Output per batch:              20×30 = 600 tokens
        """
        if self._listings == 0 or self._users == 0:
            return 0.0

        # After 3-layer funnel, ~1% of listings reach LLM (rough estimate)
        llm_survivors = min(self._listings, max(self._listings // 100, 50))
        title_batches = -(-llm_survivors // 25) * self._users        # ceil
        detail_batches = -(-max(self._avg_matches, 1) // 20) * self._users

        input_tokens  = title_batches * 1_125  + detail_batches * 12_300
        output_tokens = title_batches * 200    + detail_batches * 600

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


# ── Scrape metadata (24h gate) ───────────────────────────────────────────────

def _get_scrape_metadata(supabase) -> Optional[dict]:
    """Fetch the singleton scrape_metadata row (or None if table is empty/missing)."""
    try:
        res = supabase.table("scrape_metadata").select("*").limit(1).execute()
        rows = res.data or []
        return rows[0] if rows else None
    except Exception as exc:
        log.warning("Could not read scrape_metadata (table may not exist yet): %s", exc)
        return None


def _should_skip_scrape(supabase) -> bool:
    """Return True if a scrape ran less than 24h ago."""
    meta = _get_scrape_metadata(supabase)
    if not meta:
        return False
    next_after = meta.get("next_scrape_after")
    if not next_after:
        return False
    # Parse ISO timestamp
    if isinstance(next_after, str):
        next_after_dt = datetime.fromisoformat(next_after.replace("Z", "+00:00"))
    else:
        next_after_dt = next_after
    now = datetime.now(timezone.utc)
    if next_after_dt > now:
        log.info("Skipping scrape — next allowed at %s (now: %s)",
                 next_after_dt.isoformat(), now.strftime("%H:%M UTC"))
        return True
    return False


def _upsert_scrape_metadata(supabase, started_at: datetime, finished_at: datetime, count: int) -> None:
    """Upsert the singleton scrape_metadata row after a successful scrape.

    Gate is 23h (not 24h) so the daily 01:00 UTC cron is never blocked even when
    the previous run started 30+ min late or took longer than expected.
    """
    next_after = started_at + timedelta(hours=23)
    meta = _get_scrape_metadata(supabase)
    row = {
        "last_scrape_started_at":  started_at.isoformat(),
        "last_scrape_finished_at": finished_at.isoformat(),
        "listings_count":          count,
        "next_scrape_after":       next_after.isoformat(),
    }
    try:
        if meta and meta.get("id"):
            supabase.table("scrape_metadata").update(row).eq("id", meta["id"]).execute()
        else:
            supabase.table("scrape_metadata").insert(row).execute()
        log.info("Updated scrape_metadata: next scrape after %s", next_after.isoformat())
    except Exception as exc:
        log.warning("Failed to upsert scrape_metadata: %s", exc)


# ── Stage runners ─────────────────────────────────────────────────────────────

def _log_scraper_run(
    supabase,
    source: str,
    started_at: datetime,
    ended_at: datetime,
    jobs_found: int,
    jobs_inserted: int,
    error: str | None,
) -> None:
    """Write a row to scraper_runs for observability."""
    try:
        supabase.table("scraper_runs").insert({
            "source": source,
            "started_at": started_at.isoformat(),
            "ended_at": ended_at.isoformat(),
            "jobs_found": jobs_found,
            "jobs_inserted": jobs_inserted,
            "error": error,
        }).execute()
    except Exception as exc:
        log.warning("Could not write scraper_run log for %s: %s", source, exc)


SCRAPERS = [
    ("cvbankas", "scrape",           "run"),
    ("cvonline", "scrape_cvonline",  "run"),
    ("cvmarket", "scrape_cvmarket",  "run"),
    ("unicorns", "scrape_unicorns",  "run"),
    ("uzt",      "scrape_uzt",       "run"),
]


def _run_one_scraper(source: str, module_name: str, func_name: str, supabase) -> dict:
    """Run a single scraper, write to scraper_runs, and return a status dict.

    cvbankas's run() returns None; the others return {jobs_found, jobs_inserted, error}.
    For cvbankas we substitute today's listing count via _count_todays_listings(supabase),
    matching the previous sequential behaviour.
    """
    started = datetime.now(timezone.utc)
    try:
        import importlib
        mod = importlib.import_module(module_name)
        fn = getattr(mod, func_name)
        result = fn() or {}
        ended = datetime.now(timezone.utc)

        if source == "cvbankas":
            jobs_found = _count_todays_listings(supabase)
            jobs_inserted = 0
            error = None
        else:
            jobs_found = result.get("jobs_found", 0)
            jobs_inserted = result.get("jobs_inserted", 0)
            error = result.get("error")

        _log_scraper_run(supabase, source, started, ended, jobs_found, jobs_inserted, error)
        return {
            "source": source, "ok": error is None,
            "jobs_found": jobs_found, "jobs_inserted": jobs_inserted,
            "error": error, "duration": (ended - started).total_seconds(),
        }
    except Exception as exc:
        ended = datetime.now(timezone.utc)
        log.error("Scraper %s crashed:\n%s", source, traceback.format_exc())
        _log_scraper_run(supabase, source, started, ended, 0, 0, str(exc)[:500])
        return {
            "source": source, "ok": False,
            "jobs_found": 0, "jobs_inserted": 0,
            "error": str(exc), "duration": (ended - started).total_seconds(),
        }


def run_scraper(metrics: PipelineMetrics, supabase) -> bool:
    """
    Stage 1: scrape all 5 sources concurrently (CVBankas, CV-Online, CVmarket, Unicorns, UZT).
    Returns True iff CVBankas succeeded; matchers fall back to existing DB rows otherwise.
    Concurrency caps wall time at max(individual scrape times) instead of the sum.
    Each scraper builds its own Supabase client + browser session, so threads share no state.
    """
    log.info("━━━  Stage 1/4: Scraper  ━━━")

    if _should_skip_scrape(supabase):
        metrics.listings_scraped = _count_todays_listings(supabase)
        log.info("Stage 1 — skipped (24h gate). Existing listings: %d", metrics.listings_scraped)
        return True

    t = time.time()
    scrape_started = datetime.now(timezone.utc)
    log.info("Launching %d scrapers in parallel: %s",
             len(SCRAPERS), ", ".join(s[0] for s in SCRAPERS))

    results: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=len(SCRAPERS)) as pool:
        futures = {
            pool.submit(_run_one_scraper, src, mod, fn, supabase): src
            for src, mod, fn in SCRAPERS
        }
        for fut in as_completed(futures):
            r = fut.result()
            results[r["source"]] = r
            mark = "✓" if r["ok"] else "✗"
            err_tail = f"  err={r['error'][:80]}" if r["error"] else ""
            log.info("  %s %-9s found=%-5d inserted=%-5d  (%.1fs)%s",
                     mark, r["source"], r["jobs_found"], r["jobs_inserted"],
                     r["duration"], err_tail)

    cvbankas_ok = results.get("cvbankas", {}).get("ok", False)
    if not cvbankas_ok:
        metrics.stage_errors.append("scraper_cvbankas")

    scrape_finished = datetime.now(timezone.utc)
    metrics.listings_scraped = _count_todays_listings(supabase)

    if cvbankas_ok:
        _upsert_scrape_metadata(supabase, scrape_started, scrape_finished, metrics.listings_scraped)

    log.info("Stage 1 ✓  listings scraped today: %d  (%.1fs total)",
             metrics.listings_scraped, time.time() - t)

    if not cvbankas_ok:
        if metrics.listings_scraped == 0 and _has_any_listings(supabase, days_back=2):
            log.warning("No today's listings in DB. Matchers will use yesterday's data.")
        return False

    return True


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


def run_cleanup(supabase) -> None:
    """
    Post-pipeline cleanup: remove orphaned and garbage matches.
    - Delete matches with detail_score IS NULL from previous runs (not today)
    - Delete matches with detail_score <= 2
    """
    log.info("━━━  Cleanup: removing garbage matches  ━━━")
    try:
        today = _today_iso()

        # Delete old unscored matches (detail_score IS NULL, not from today)
        res1 = (
            supabase.table("matches")
            .delete()
            .is_("detail_score", "null")
            .lt("matched_at", f"{today}T00:00:00+00:00")
            .execute()
        )
        deleted_null = len(res1.data or [])

        # Delete confirmed garbage matches (detail_score <= 2)
        res2 = (
            supabase.table("matches")
            .delete()
            .lte("detail_score", 2)
            .execute()
        )
        deleted_garbage = len(res2.data or [])

        log.info("Cleanup ✓  deleted %d orphaned (NULL score) + %d garbage (score<=2) matches",
                 deleted_null, deleted_garbage)
    except Exception:
        log.warning("Cleanup failed (non-fatal):\n%s", traceback.format_exc())


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
        # run_scraper itself checks the 24h gate via scrape_metadata
        run_scraper(metrics, supabase)

    elif RUN_MODE == "matcher":
        # Skip if matcher already ran today (prevents re-run on redeploy)
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        existing_matches = supabase.table("matches").select("id", count="exact") \
            .gte("matched_at", f"{today}T00:00:00+00:00").execute()
        if (existing_matches.count or 0) > 0:
            log.info("Matcher already ran today (%d matches in DB) — skipping.",
                     existing_matches.count)
        else:
            metrics.listings_scraped = _count_todays_listings(supabase)
            job_map = run_title_matcher(metrics)
            run_detail_scraper(job_map, metrics)
            run_detail_matcher(metrics, supabase)
            run_cleanup(supabase)

    else:  # "full" or unrecognised — run everything (no skip guard, manual use)
        run_scraper(metrics, supabase)
        job_map = run_title_matcher(metrics)
        run_detail_scraper(job_map, metrics)
        run_detail_matcher(metrics, supabase)
        run_cleanup(supabase)
    # ─────────────────────────────────────────────────────────────────────

    metrics.total_seconds = time.time() - wall_start
    print_summary(metrics)

    return 1 if metrics.stage_errors else 0


if __name__ == "__main__":
    sys.exit(main())

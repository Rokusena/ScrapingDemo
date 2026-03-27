#!/usr/bin/env python3
"""
GaukDarba — Detail scraper  (Phase 2a of pipeline)

Receives the job_map {user_id: [job_ids]} from title_matcher,
fetches each job's CVBankas detail page, and upserts into listing_details.

Requires supabase migration 002 (unique constraint on listing_details.job_id).

Required env vars:
  SUPABASE_URL         — https://xxx.supabase.co
  SUPABASE_SERVICE_KEY — service-role key (bypasses RLS)
"""

import logging
import os
import random
import time
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup
from supabase import create_client

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL         = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

MAX_RETRIES = 3
DELAY_MIN   = 0.8
DELAY_MAX   = 1.5

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
]

# Tried in order — first selector that yields non-empty text wins
DESCRIPTION_SELECTORS = [
    "div.jobad_txt",
    "div#jobad_description",
    "div.jobad-description",
    "div.jobad_content",
    "div[class*='jobad_txt']",
    "section.job-description",
    "div.job-description",
    "article.jobad",
]

REQUIREMENTS_SELECTORS = [
    "div.jobad_requirements",
    "div#requirements",
    "div[class*='requirements']",
    "section.requirements",
]

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("gaukdarba.detail_scraper")


# ── Helpers ───────────────────────────────────────────────────────────────────

def clean(text: str | None) -> str:
    if not text:
        return ""
    return " ".join(text.split()).strip()


def random_delay() -> None:
    time.sleep(random.uniform(DELAY_MIN, DELAY_MAX))


def fetch_with_retry(session: requests.Session, url: str) -> requests.Response | None:
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            session.headers["User-Agent"] = random.choice(USER_AGENTS)
            resp = session.get(url, timeout=20)
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            wait = 2 ** attempt
            if attempt < MAX_RETRIES:
                log.warning("Attempt %d/%d failed: %s — retry in %ds", attempt, MAX_RETRIES, exc, wait)
                time.sleep(wait)
            else:
                log.error("Permanently failed after %d attempts: %s — %s", MAX_RETRIES, url, exc)
    return None


# ── HTML parsing ──────────────────────────────────────────────────────────────

def _first_match(soup: BeautifulSoup, selectors: list[str]) -> str | None:
    for selector in selectors:
        el = soup.select_one(selector)
        if el:
            text = el.get_text(separator="\n").strip()
            if text:
                return text
    return None


def parse_detail_page(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")

    # ── Description ──────────────────────────────────────────────────────
    description = _first_match(soup, DESCRIPTION_SELECTORS)

    # Fallback: the largest text block on the page
    if not description:
        candidates = [
            el for el in soup.find_all(["div", "section", "article"])
            if len(el.get_text()) > 200
        ]
        if candidates:
            description = max(candidates, key=lambda el: len(el.get_text())).get_text(
                separator="\n"
            ).strip()

    # ── Requirements ─────────────────────────────────────────────────────
    requirements = _first_match(soup, REQUIREMENTS_SELECTORS)

    # ── Full salary (may be richer than the list-page scraped value) ──────
    parts = []
    for sel in ("span.salary_amount", "span.salary_period", "span.salary_calculation"):
        el = soup.select_one(sel)
        if el:
            t = clean(el.get_text())
            if t:
                parts.append(t)
    full_salary = " ".join(parts) or None

    return {
        "description": description or None,
        "full_salary": full_salary,
        "requirements": requirements or None,
    }


# ── Supabase helpers ──────────────────────────────────────────────────────────

def load_urls(supabase, job_ids: list[str]) -> dict[str, str]:
    res = (
        supabase.table("raw_listings")
        .select("job_id, url")
        .in_("job_id", job_ids)
        .execute()
    )
    return {r["job_id"]: r["url"] for r in (res.data or []) if r.get("url")}


def load_already_scraped_today(supabase, job_ids: list[str]) -> set[str]:
    """job_ids that already have a listing_details entry scraped today."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    res = (
        supabase.table("listing_details")
        .select("job_id")
        .in_("job_id", job_ids)
        .gte("scraped_at", f"{today}T00:00:00+00:00")
        .execute()
    )
    return {r["job_id"] for r in (res.data or [])}


# ── Main entry point ──────────────────────────────────────────────────────────

def scrape_details(job_map: dict[str, list[str]]) -> None:
    """
    Fetch and store detail pages for all job_ids in job_map.

    Args:
        job_map: {user_id: [job_id, ...]} as returned by title_matcher.run()
    """
    # Deduplicate job_ids across all users — each page is fetched only once
    all_job_ids: list[str] = list({jid for ids in job_map.values() for jid in ids})

    if not all_job_ids:
        log.info("No job_ids to scrape — nothing to do.")
        return

    log.info("=" * 55)
    log.info(
        "GaukDarba detail_scraper — %s",
        datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    )
    log.info("Unique job_ids requested: %d", len(all_job_ids))
    log.info("=" * 55)

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    already_done = load_already_scraped_today(supabase, all_job_ids)
    to_scrape    = [jid for jid in all_job_ids if jid not in already_done]

    log.info(
        "Already scraped today: %d  |  Remaining: %d",
        len(already_done), len(to_scrape),
    )

    if not to_scrape:
        log.info("All detail entries are fresh — done.")
        return

    url_map      = load_urls(supabase, to_scrape)
    missing_urls = [jid for jid in to_scrape if jid not in url_map]
    if missing_urls:
        log.warning(
            "%d job_ids have no URL in raw_listings — skipping them",
            len(missing_urls),
        )

    session = requests.Session()
    session.headers.update({
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "lt-LT,lt;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
    })

    scraped  = 0
    failed   = 0
    now_utc  = datetime.now(timezone.utc).isoformat()
    total    = len(to_scrape)

    for idx, job_id in enumerate(to_scrape, 1):
        url = url_map.get(job_id)
        if not url:
            continue

        log.info("[%d/%d]  job_id=%s  %s", idx, total, job_id, url)

        resp = fetch_with_retry(session, url)
        if resp is None:
            failed += 1
            continue

        parsed = parse_detail_page(resp.text)

        row = {
            "job_id":       job_id,
            "description":  parsed["description"],
            "full_salary":  parsed["full_salary"],
            "requirements": parsed["requirements"],
            "scraped_at":   now_utc,
        }
        try:
            supabase.table("listing_details").upsert(row, on_conflict="job_id").execute()
        except Exception:
            # Fallback if unique constraint on job_id is missing: delete then insert
            supabase.table("listing_details").delete().eq("job_id", job_id).execute()
            supabase.table("listing_details").insert(row).execute()

        scraped += 1
        desc_len = len(parsed["description"] or "")
        log.info("  → saved  desc=%d chars  salary=%s", desc_len, parsed["full_salary"] or "—")

        if idx < total:
            random_delay()

    log.info("=" * 55)
    log.info("Detail scraping complete.")
    log.info("  Scraped  : %d", scraped)
    log.info("  Failed   : %d", failed)
    log.info("  Skipped  : %d (already done today + no URL)", len(already_done) + len(missing_urls))
    log.info("=" * 55)


# ── Standalone mode ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Re-run scraping for all today's title-matched jobs that are still missing details
    _supa = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    _today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    _res = (
        _supa.table("matches")
        .select("user_id, job_id")
        .gte("title_score", 5)
        .gte("matched_at", f"{_today}T00:00:00+00:00")
        .execute()
    )
    _job_map: dict[str, list[str]] = {}
    for row in (_res.data or []):
        _job_map.setdefault(row["user_id"], []).append(row["job_id"])

    scrape_details(_job_map)

#!/usr/bin/env python3
"""
GaukDarba — CV-Online.lt (cv.lt) scraper
Scrapes job listings and upserts to Supabase raw_listings with source='cvonline'.

Env vars required:
  SUPABASE_URL         — https://xxx.supabase.co
  SUPABASE_SERVICE_KEY — service-role key (bypasses RLS)
"""

import hashlib
import logging
import os
import random
import re
import time
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup
from supabase import create_client

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

SOURCE = "cvonline"
BASE_URL = "https://www.cv.lt"
LIST_URL = f"{BASE_URL}/jobs"
MAX_PAGES = 50
MAX_RETRIES = 3
BATCH_SIZE = 100
RATE_LIMIT_DELAY = 2.0  # seconds between requests

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  [cvonline] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("gaukdarba.cvonline")


# ── Helpers ───────────────────────────────────────────────────────────────────

def clean(text: str | None) -> str:
    if not text:
        return ""
    return " ".join(text.split()).strip()


def make_job_id(external_id: str) -> str:
    """Prefixed job_id for uniqueness across sources."""
    return f"cvonline_{external_id}"


def make_external_id(url: str) -> str:
    """Extract numeric ID from URL or fall back to MD5 hash."""
    m = re.search(r"/(\d{4,})", url)
    if m:
        return m.group(1)
    return hashlib.md5(url.encode()).hexdigest()[:12]


def fetch_with_retry(session: requests.Session, url: str) -> requests.Response | None:
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            session.headers["User-Agent"] = random.choice(USER_AGENTS)
            resp = session.get(url, timeout=20)
            if resp.status_code == 429:
                wait = 2 ** attempt * 5
                log.warning("Rate limited — sleeping %ds", wait)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            wait = 2 ** attempt
            if attempt < MAX_RETRIES:
                log.warning("Attempt %d/%d failed: %s — retry in %ds", attempt, MAX_RETRIES, exc, wait)
                time.sleep(wait)
            else:
                log.error("Permanently failed: %s — %s", url, exc)
    return None


# ── Parsing ───────────────────────────────────────────────────────────────────

def parse_listings(html: str, now_utc: str) -> list[dict]:
    """
    cv.lt page structure:
      article[data-component=jobad]
        a[href$="-NNNNNN"]  → relative job URL (ends in -<6+ digit id>)
        stripped_strings:   [age, title, company, city, salary, ...]
    """
    soup = BeautifulSoup(html, "lxml")
    results: list[dict] = []

    cards = soup.select("article[data-component=jobad]")

    for card in cards:
        try:
            # Job URL — link ending in -XXXXXXX (6+ digit ID)
            job_link = next(
                (l for l in card.select("a[href]") if re.search(r"-\d{6,}$", l.get("href", ""))),
                None,
            )
            href = job_link.get("href", "") if job_link else ""
            url = (BASE_URL + href) if href and not href.startswith("http") else href

            external_id = make_external_id(href or url)
            job_id = make_job_id(external_id)

            # Texts layout: [age, title, company, city, salary, ...]
            texts = [t.strip() for t in card.stripped_strings if len(t.strip()) > 1]
            title   = texts[1] if len(texts) > 1 else (texts[0] if texts else "")
            company = texts[2] if len(texts) > 2 else None
            location = texts[3] if len(texts) > 3 else None
            salary_raw = texts[4] if len(texts) > 4 else None

            if not title or len(title) < 3:
                continue

            results.append({
                "job_id": job_id,
                "source": SOURCE,
                "title": title,
                "company": company or None,
                "salary_raw": salary_raw or None,
                "location": location or None,
                "url": url,
                "scraped_at": now_utc,
            })

        except Exception as exc:
            log.warning("Parse error: %s", exc)

    return results


def has_next_page(html: str, current_page: int) -> bool:
    soup = BeautifulSoup(html, "lxml")
    # cv.lt uses ?page=N pagination
    return bool(soup.select_one(f'a[href*="page={current_page + 1}"]'))


# ── Main ──────────────────────────────────────────────────────────────────────

def run() -> dict:
    """Returns summary dict: {jobs_found, jobs_inserted, error}"""
    log.info("CV-Online scraper starting")
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    session = requests.Session()
    session.headers.update({
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "lt-LT,lt;q=0.9,en;q=0.8",
        "DNT": "1",
    })

    now_utc = datetime.now(timezone.utc).isoformat()
    total_found = 0
    total_inserted = 0
    existing_ids: set[str] = set()

    # Load existing cvonline job_ids
    try:
        page_size = 1000
        offset = 0
        while True:
            rows = (
                supabase.table("raw_listings")
                .select("job_id")
                .eq("source", SOURCE)
                .range(offset, offset + page_size - 1)
                .execute()
                .data or []
            )
            existing_ids.update(r["job_id"] for r in rows)
            if len(rows) < page_size:
                break
            offset += page_size
        log.info("Loaded %d existing %s job_ids", len(existing_ids), SOURCE)
    except Exception as exc:
        log.warning("Could not load existing IDs: %s", exc)

    for page in range(1, MAX_PAGES + 1):
        url = f"{LIST_URL}?page={page}" if page > 1 else LIST_URL
        log.info("Page %d → %s", page, url)

        resp = fetch_with_retry(session, url)
        if resp is None:
            log.error("Failed to fetch page %d", page)
            break

        listings = parse_listings(resp.text, now_utc)
        log.info("  %d listings parsed", len(listings))

        if not listings:
            log.info("Empty page %d — done", page)
            break

        total_found += len(listings)

        # Insert new listings
        new_listings = [l for l in listings if l["job_id"] not in existing_ids]
        if new_listings:
            for i in range(0, len(new_listings), BATCH_SIZE):
                chunk = new_listings[i: i + BATCH_SIZE]
                supabase.table("raw_listings").upsert(chunk, on_conflict="job_id").execute()
            total_inserted += len(new_listings)
            existing_ids.update(l["job_id"] for l in new_listings)

        time.sleep(RATE_LIMIT_DELAY)

    log.info("CV-Online done: found=%d inserted=%d", total_found, total_inserted)
    return {"jobs_found": total_found, "jobs_inserted": total_inserted, "error": None}


if __name__ == "__main__":
    result = run()
    print(result)

#!/usr/bin/env python3
"""
GaukDarba — Užimtumo tarnyba (UZT.lt) scraper
Scrapes government job board listings.
Upserts to Supabase raw_listings with source='uzt'.

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

SOURCE = "uzt"
BASE_URL = "https://www.uzt.lt"
LIST_URL = f"{BASE_URL}/darbo-pasiulymai"
MAX_PAGES = 50
MAX_RETRIES = 3
BATCH_SIZE = 100
RATE_LIMIT_DELAY = 1.5

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  [uzt] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("gaukdarba.uzt")


# ── Helpers ───────────────────────────────────────────────────────────────────

def clean(text: str | None) -> str:
    if not text:
        return ""
    return " ".join(text.split()).strip()


def make_job_id(external_id: str) -> str:
    return f"uzt_{external_id}"


def extract_id(url: str) -> str:
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
                wait = 2 ** attempt * 3
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
    soup = BeautifulSoup(html, "lxml")
    results: list[dict] = []

    # UZT uses a table or list structure — try multiple selectors
    rows = (
        soup.select("table.views-table tbody tr")
        or soup.select("div.view-content > div.views-row")
        or soup.select("article.node--type-darbo-pasiulymas")
        or soup.select("[class*='job'], [class*='vacancy']")
    )

    for row in rows:
        try:
            # Title link
            link = row.select_one("a[href*='/darbo-pasiulymai/'], a[href*='/jobs/'], h2 a, h3 a, td a")
            if not link:
                continue

            href = link.get("href", "")
            url = href if href.startswith("http") else BASE_URL + href
            title = clean(link.get_text())

            external_id = extract_id(url)
            job_id = make_job_id(external_id)

            # Company / employer
            company_el = row.select_one(
                "[class*='company'], [class*='employer'], [class*='darboviete'], td:nth-child(2)"
            )
            company = clean(company_el.get_text()) if company_el else None

            # Salary
            salary_el = row.select_one("[class*='salary'], [class*='atlyginimas'], td:nth-child(4)")
            salary_raw = clean(salary_el.get_text()) if salary_el else None

            # Location
            location_el = row.select_one(
                "[class*='location'], [class*='city'], [class*='miestas'], td:nth-child(3)"
            )
            location = clean(location_el.get_text()) if location_el else None

            if not title or len(title) < 3:
                continue

            results.append({
                "job_id": job_id,
                "source": SOURCE,
                "title": title,
                "company": company,
                "salary_raw": salary_raw or None,
                "location": location,
                "url": url,
                "scraped_at": now_utc,
            })

        except Exception as exc:
            log.warning("Parse error: %s", exc)

    return results


def find_next_page_url(html: str, current_page: int) -> str | None:
    """Returns absolute URL of next page or None."""
    soup = BeautifulSoup(html, "lxml")
    # Drupal pagination
    next_link = soup.select_one(
        'a[title="Go to next page"], a.pager__link--next, li.pager__item--next a, '
        f'a[href*="page={current_page + 1}"]'
    )
    if not next_link:
        return None
    href = next_link.get("href", "")
    return href if href.startswith("http") else BASE_URL + href


# ── Main ──────────────────────────────────────────────────────────────────────

def run() -> dict:
    log.info("UZT scraper starting")
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

    # Load existing IDs
    try:
        offset = 0
        page_size = 1000
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

    current_url = LIST_URL
    for page in range(MAX_PAGES):
        log.info("Page %d → %s", page + 1, current_url)

        resp = fetch_with_retry(session, current_url)
        if resp is None:
            log.error("Failed to fetch page %d", page + 1)
            break

        listings = parse_listings(resp.text, now_utc)
        log.info("  %d listings parsed", len(listings))

        if not listings:
            log.info("Empty page — done")
            break

        total_found += len(listings)

        new_listings = [l for l in listings if l["job_id"] not in existing_ids]
        if new_listings:
            for i in range(0, len(new_listings), BATCH_SIZE):
                chunk = new_listings[i: i + BATCH_SIZE]
                supabase.table("raw_listings").upsert(chunk, on_conflict="job_id").execute()
            total_inserted += len(new_listings)
            existing_ids.update(l["job_id"] for l in new_listings)

        next_url = find_next_page_url(resp.text, page)
        if not next_url:
            log.info("No next page after page %d — done", page + 1)
            break

        current_url = next_url
        time.sleep(RATE_LIMIT_DELAY)

    log.info("UZT done: found=%d inserted=%d", total_found, total_inserted)
    return {"jobs_found": total_found, "jobs_inserted": total_inserted, "error": None}


if __name__ == "__main__":
    result = run()
    print(result)

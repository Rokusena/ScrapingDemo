#!/usr/bin/env python3
"""
GaukDarba — CVmarket.lt scraper
Scrapes job listings and upserts to Supabase raw_listings with source='cvmarket'.

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

SOURCE = "cvmarket"
BASE_URL = "https://www.cvmarket.lt"
LIST_URL = f"{BASE_URL}/darbo-skelbimai"
# Also check for RSS/API feeds
RSS_URL = f"{BASE_URL}/rss/jobs"
MAX_PAGES = 50
MAX_RETRIES = 3
BATCH_SIZE = 100
RATE_LIMIT_DELAY = 2.0

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  [cvmarket] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("gaukdarba.cvmarket")


# ── Helpers ───────────────────────────────────────────────────────────────────

def clean(text: str | None) -> str:
    if not text:
        return ""
    return " ".join(text.split()).strip()


def make_job_id(external_id: str) -> str:
    return f"cvmarket_{external_id}"


def extract_id_from_url(url: str) -> str:
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


# ── RSS parsing (preferred if available) ─────────────────────────────────────

def try_rss(session: requests.Session, now_utc: str) -> list[dict] | None:
    """Try fetching via RSS feed. Returns list of records or None if not available."""
    resp = fetch_with_retry(session, RSS_URL)
    if not resp or "xml" not in resp.headers.get("Content-Type", ""):
        return None

    soup = BeautifulSoup(resp.text, "lxml-xml")
    items = soup.select("item")
    if not items:
        return None

    results: list[dict] = []
    for item in items:
        try:
            title_el = item.find("title")
            link_el = item.find("link")
            desc_el = item.find("description")

            url = clean(link_el.get_text()) if link_el else ""
            title = clean(title_el.get_text()) if title_el else ""
            if not url or not title:
                continue

            external_id = extract_id_from_url(url)
            job_id = make_job_id(external_id)

            # Try to parse company from description
            desc_text = clean(desc_el.get_text()) if desc_el else ""

            results.append({
                "job_id": job_id,
                "source": SOURCE,
                "title": title,
                "company": None,
                "salary_raw": None,
                "location": None,
                "url": url,
                "scraped_at": now_utc,
            })
        except Exception as exc:
            log.warning("RSS parse error: %s", exc)

    log.info("Parsed %d records from RSS", len(results))
    return results


# ── HTML parsing (fallback) ───────────────────────────────────────────────────

def parse_listings(html: str, now_utc: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    results: list[dict] = []

    # Try multiple card selectors
    cards = (
        soup.select("article.job-ad")
        or soup.select("div.job-ad")
        or soup.select("li.job-list-item")
        or soup.select("[class*='job-item'], [class*='vacancy']")
    )

    for card in cards:
        try:
            link = card.select_one("a[href*='/darbo-skelbimai/'], a.job-title, h2 a, h3 a")
            if not link:
                continue

            href = link.get("href", "")
            url = href if href.startswith("http") else BASE_URL + href
            title = clean(link.get_text())

            external_id = extract_id_from_url(url)
            job_id = make_job_id(external_id)

            company_el = card.select_one("[class*='company'], .employer")
            company = clean(company_el.get_text()) if company_el else None

            salary_el = card.select_one("[class*='salary']")
            salary_raw = clean(salary_el.get_text()) if salary_el else None

            location_el = card.select_one("[class*='location'], [class*='city']")
            location = clean(location_el.get_text()) if location_el else None

            if not title:
                continue

            results.append({
                "job_id": job_id,
                "source": SOURCE,
                "title": title,
                "company": company,
                "salary_raw": salary_raw,
                "location": location,
                "url": url,
                "scraped_at": now_utc,
            })

        except Exception as exc:
            log.warning("Parse error: %s", exc)

    return results


def has_next_page(html: str, current_page: int) -> bool:
    soup = BeautifulSoup(html, "lxml")
    return bool(soup.select_one(
        f'a[href*="page={current_page + 1}"], a.pagination-next, a[aria-label*="Next"]'
    ))


# ── Main ──────────────────────────────────────────────────────────────────────

def run() -> dict:
    log.info("CVmarket scraper starting")
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

    # Load existing job_ids
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

    # Try RSS first
    rss_records = try_rss(session, now_utc)
    all_records: list[dict] = []

    if rss_records:
        all_records = rss_records
    else:
        # Fallback: paginate HTML
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

            all_records.extend(listings)

            if not has_next_page(resp.text, page):
                log.info("No next page after %d — done", page)
                break

            time.sleep(RATE_LIMIT_DELAY)

    total_found = len(all_records)

    # Upsert new records
    new_records = [r for r in all_records if r["job_id"] not in existing_ids]
    if new_records:
        for i in range(0, len(new_records), BATCH_SIZE):
            chunk = new_records[i: i + BATCH_SIZE]
            supabase.table("raw_listings").upsert(chunk, on_conflict="job_id").execute()
        total_inserted = len(new_records)

    log.info("CVmarket done: found=%d inserted=%d", total_found, total_inserted)
    return {"jobs_found": total_found, "jobs_inserted": total_inserted, "error": None}


if __name__ == "__main__":
    result = run()
    print(result)

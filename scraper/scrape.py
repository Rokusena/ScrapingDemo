#!/usr/bin/env python3
"""
GaukDarba — CVBankas.lt full scraper
Scrapes ALL job listings across every category and upserts to Supabase.
Designed to run as a cron job 2× daily.

Env vars required:
  SUPABASE_URL          — https://xxx.supabase.co
  SUPABASE_SERVICE_KEY  — service-role key (bypasses RLS)
"""

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

SUPABASE_URL         = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

BASE_URL       = "https://www.cvbankas.lt"
PAGE_TEMPLATE  = f"{BASE_URL}/?page={{page}}"
MAX_RETRIES    = 3
BATCH_SIZE     = 100   # listings per Supabase upsert call

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
]

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("gaukdarba.scraper")


# ── Helpers ───────────────────────────────────────────────────────────────────

def clean(text: str | None) -> str:
    if not text:
        return ""
    return " ".join(text.split()).strip()


def random_ua() -> str:
    return random.choice(USER_AGENTS)


def random_delay() -> None:
    time.sleep(random.uniform(0.5, 1.5))


def fetch_with_retry(session: requests.Session, url: str) -> requests.Response | None:
    """GET a URL with up to MAX_RETRIES attempts and exponential backoff."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            session.headers["User-Agent"] = random_ua()
            resp = session.get(url, timeout=20)
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            wait = 2 ** attempt
            if attempt < MAX_RETRIES:
                log.warning(
                    "Request failed (attempt %d/%d): %s — retrying in %ds",
                    attempt, MAX_RETRIES, exc, wait,
                )
                time.sleep(wait)
            else:
                log.error(
                    "Permanently failed after %d attempts: %s — %s",
                    MAX_RETRIES, url, exc,
                )
    return None


def extract_job_id(article) -> str:
    """Extract numeric job ID from article id='job_ad_XXXXXXX' or fallback to URL slug."""
    art_id = article.get("id", "")
    m = re.search(r"(\d+)$", art_id)
    if m:
        return m.group(1)
    # Fallback: pull from href  e.g. /pozicija-title/12345678
    link = article.select_one("a.list_a")
    if link:
        href = link.get("href", "")
        m2 = re.search(r"/(\d[\d-]+?)(?:/)?$", href)
        if m2:
            return m2.group(1)
    return ""


def parse_listings(html: str, now_utc: str) -> list[dict]:
    """Parse every article.list_article on a results page."""
    soup = BeautifulSoup(html, "html.parser")
    results: list[dict] = []

    for article in soup.select("article.list_article"):
        try:
            link_tag = article.select_one("a.list_a")
            if not link_tag:
                continue

            href = link_tag.get("href", "")
            url = href if href.startswith("http") else BASE_URL + href

            job_id = extract_job_id(article)
            if not job_id:
                continue

            h3 = article.select_one("h3.list_h3")
            title = clean(h3.get_text()) if h3 else ""

            company_el = article.select_one("span.heading_secondary span")
            company = clean(company_el.get_text()) if company_el else ""

            salary_amount = clean(
                article.select_one("span.salary_amount").get_text()
                if article.select_one("span.salary_amount") else ""
            )
            salary_period = clean(
                article.select_one("span.salary_period").get_text()
                if article.select_one("span.salary_period") else ""
            )
            salary_calc = clean(
                article.select_one("span.salary_calculation").get_text()
                if article.select_one("span.salary_calculation") else ""
            )
            salary_raw = " ".join(p for p in [salary_amount, salary_period, salary_calc] if p) or None

            city_el = article.select_one("span.list_city")
            location = clean(city_el.get_text()) if city_el else None

            results.append({
                "job_id":     job_id,
                "title":      title,
                "company":    company,
                "salary_raw": salary_raw,
                "location":   location,
                "url":        url,
                "scraped_at": now_utc,
            })

        except Exception as exc:
            snippet = clean(article.get_text())[:120]
            log.warning("Parse error: %s | article: %s", exc, snippet)

    return results


def has_next_page(html: str, current_page: int) -> bool:
    soup = BeautifulSoup(html, "html.parser")
    target = f"page={current_page + 1}"
    return any(target in (a.get("href") or "") for a in soup.select("a[href]"))


def load_existing_ids(supabase) -> set[str]:
    """Fetch all job_ids currently in raw_listings (paginated)."""
    ids: set[str] = set()
    page_size = 1000
    offset = 0
    while True:
        result = (
            supabase.table("raw_listings")
            .select("job_id")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = result.data or []
        ids.update(r["job_id"] for r in rows)
        if len(rows) < page_size:
            break
        offset += page_size
    log.info("Loaded %d existing job_ids from DB", len(ids))
    return ids


def upsert_batch(supabase, records: list[dict], existing_ids: set[str]) -> tuple[int, int]:
    """Upsert records in chunks of BATCH_SIZE. Returns (new, updated)."""
    if not records:
        return 0, 0

    new_count     = sum(1 for r in records if r["job_id"] not in existing_ids)
    updated_count = len(records) - new_count

    for i in range(0, len(records), BATCH_SIZE):
        chunk = records[i : i + BATCH_SIZE]
        supabase.table("raw_listings").upsert(chunk, on_conflict="job_id").execute()

    return new_count, updated_count


def delete_stale(supabase, current_scrape_time: str) -> int:
    """Delete raw_listings not seen in the current scrape (removed from cvbankas)."""
    result = (
        supabase.table("raw_listings")
        .delete()
        .lt("scraped_at", current_scrape_time)
        .execute()
    )
    deleted = len(result.data) if result.data else 0
    log.info("Deleted %d stale listings (not seen in current scrape)", deleted)
    return deleted


# ── Main ──────────────────────────────────────────────────────────────────────

def run() -> None:
    log.info("=" * 55)
    log.info("GaukDarba scraper starting — %s", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"))
    log.info("=" * 55)

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    existing_ids = load_existing_ids(supabase)

    session = requests.Session()
    session.headers.update({
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "lt-LT,lt;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT":             "1",
    })

    total_new     = 0
    total_updated = 0
    current_page  = 1
    now_utc       = datetime.now(timezone.utc).isoformat()

    while True:
        url = BASE_URL if current_page == 1 else PAGE_TEMPLATE.format(page=current_page)
        log.info("Page %3d → %s", current_page, url)

        resp = fetch_with_retry(session, url)
        if resp is None:
            log.error("Could not fetch page %d — aborting pagination.", current_page)
            break

        html = resp.text
        listings = parse_listings(html, now_utc)
        log.info("         %d listings parsed", len(listings))

        if not listings:
            log.info("Empty page %d — done.", current_page)
            break

        new_c, upd_c = upsert_batch(supabase, listings, existing_ids)
        total_new     += new_c
        total_updated += upd_c

        # keep local set in sync so later pages count correctly
        existing_ids.update(r["job_id"] for r in listings)

        if not has_next_page(html, current_page):
            log.info("No next-page link after page %d — done.", current_page)
            break

        current_page += 1
        random_delay()

    # ── Cleanup stale rows ────────────────────────────────────────────────
    delete_stale(supabase, now_utc)

    # ── Final summary ─────────────────────────────────────────────────────
    log.info("=" * 55)
    log.info("Scrape finished.")
    log.info("  New listings    : %d", total_new)
    log.info("  Updated listings: %d", total_updated)
    log.info("  Total processed : %d", total_new + total_updated)
    log.info("  Pages scraped   : %d", current_page)
    log.info("=" * 55)


if __name__ == "__main__":
    run()

#!/usr/bin/env python3
"""
GaukDarba — Unicorns.lt scraper
Uses the JSON API: GET https://unicorns.lt/api/more-job?page=N
Returns {rows: "<html fragment>", totalResults: N, noResults: bool}
Each page has 12 cards with selectors: .card.listing > h3, .company, .label, a[href]
"""

import logging
import os
import re
import time
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup
from supabase import create_client

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

SOURCE = "unicorns"
BASE_URL = "https://unicorns.lt"
API_URL = f"{BASE_URL}/api/more-job"
MAX_PAGES = 50          # 50 × 12 = 600 listings cap
BATCH_SIZE = 100

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": f"{BASE_URL}/darbo-skelbimai",
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  [unicorns] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("gaukdarba.unicorns")


# ── Helpers ───────────────────────────────────────────────────────────────────

def clean(text: str | None) -> str:
    if not text:
        return ""
    return " ".join(text.split()).strip()


def make_job_id(href: str) -> str:
    """Derive stable ID from the job URL path."""
    slug = re.sub(r"[^a-z0-9]+", "-", href.lower().strip("/"))[-60:]
    return f"unicorns_{slug}"


# ── Scraping ──────────────────────────────────────────────────────────────────

def scrape_all(now_utc: str) -> list[dict]:
    session = requests.Session()
    session.headers.update(HEADERS)

    results: list[dict] = []
    seen: set[str] = set()

    for page_num in range(1, MAX_PAGES + 1):
        url = API_URL if page_num == 1 else f"{API_URL}?page={page_num}"
        try:
            resp = session.get(url, timeout=20)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            log.warning("API request failed at page %d: %s", page_num, exc)
            break

        if data.get("noResults"):
            log.info("noResults=true at page %d — done", page_num)
            break

        html_fragment = data.get("rows", "")
        total = data.get("totalResults", 0)

        if not html_fragment:
            break

        soup = BeautifulSoup(html_fragment, "lxml")
        cards = soup.select(".card.listing") or soup.select(".listing") or soup.select(".card")

        if not cards:
            log.info("No cards at page %d — done", page_num)
            break

        new_count = 0
        for card in cards:
            try:
                link = card.select_one("a[href]")
                href = link.get("href", "") if link else ""
                if not href or href in seen:
                    continue
                seen.add(href)

                job_url = href if href.startswith("http") else BASE_URL + href
                job_id = make_job_id(href)

                h3 = card.select_one("h3")
                title = clean(h3.get_text()) if h3 else ""
                if len(title) < 3:
                    continue

                company_el = card.select_one(".company")
                company_text = clean(company_el.get_text()) if company_el else ""
                if ", " in company_text:
                    parts = company_text.rsplit(", ", 1)
                    company, location = parts[0], parts[1]
                else:
                    company, location = company_text or None, None

                salary_el = card.select_one(".label") or card.select_one("[class*='salary']")
                salary_raw = clean(salary_el.get_text()) if salary_el else None
                if salary_raw and salary_raw.lower() in ("n/a", ""):
                    salary_raw = None

                results.append({
                    "job_id": job_id,
                    "source": SOURCE,
                    "title": title,
                    "company": company or None,
                    "salary_raw": salary_raw,
                    "location": location or None,
                    "url": job_url,
                    "scraped_at": now_utc,
                })
                new_count += 1
            except Exception as exc:
                log.warning("Card parse error: %s", exc)

        log.info("Page %d: %d cards, %d new (total so far: %d / %d)", page_num, len(cards), new_count, len(results), total)

        if new_count == 0 or (total and len(results) >= total):
            break

        time.sleep(1)

    return results


# ── Main ──────────────────────────────────────────────────────────────────────

def run() -> dict:
    log.info("Unicorns scraper starting")
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    now_utc = datetime.now(timezone.utc).isoformat()

    listings = scrape_all(now_utc)
    total_found = len(listings)

    if not listings:
        log.warning("No listings extracted — aborting")
        return {"jobs_found": 0, "jobs_inserted": 0, "error": "No listings extracted"}

    # Load existing IDs
    existing_ids: set[str] = set()
    try:
        rows = (
            supabase.table("raw_listings")
            .select("job_id")
            .eq("source", SOURCE)
            .execute()
            .data or []
        )
        existing_ids.update(r["job_id"] for r in rows)
        log.info("Loaded %d existing %s job_ids", len(existing_ids), SOURCE)
    except Exception as exc:
        log.warning("Could not load existing IDs: %s", exc)

    new_listings = [l for l in listings if l["job_id"] not in existing_ids]
    total_inserted = 0
    if new_listings:
        for i in range(0, len(new_listings), BATCH_SIZE):
            chunk = new_listings[i: i + BATCH_SIZE]
            supabase.table("raw_listings").upsert(chunk, on_conflict="job_id").execute()
        total_inserted = len(new_listings)

    log.info("Unicorns done: found=%d inserted=%d", total_found, total_inserted)
    return {"jobs_found": total_found, "jobs_inserted": total_inserted, "error": None}


if __name__ == "__main__":
    result = run()
    print(result)

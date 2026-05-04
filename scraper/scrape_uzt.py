#!/usr/bin/env python3
"""
GaukDarba — Užimtumo tarnyba (UZT.lt) scraper
Uses direct HTTP GET to the results endpoint (no Angular/Playwright needed).

Listing URL:  GET https://uzt.lt/laisvos-darbo-vietos/436/results?s=60&n=100
Pagination:   https://uzt.lt/laisvos-darbo-vietos/436/results/p{offset}?s=60;q=;n=100

Job cards:  a.list__item
  Title:    .title strong
  Company:  .company
  Salary:   .salary
  Location: .location
"""

import logging
import os
import re
import time
from datetime import datetime, timezone

from curl_cffi import requests
from bs4 import BeautifulSoup
from supabase import create_client

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

SOURCE = "uzt"
BASE_URL = "https://uzt.lt"
RESULTS_URL = f"{BASE_URL}/laisvos-darbo-vietos/436/results"
PAGE_SIZE = 100
MAX_PAGES = 60          # 60 × 100 = 6000 listings cap
BATCH_SIZE = 100
RATE_LIMIT_DELAY = 1.5

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "lt-LT,lt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": f"{BASE_URL}/laisvos-darbo-vietos/paieska/436",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
}

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


def make_job_id(href_path: str) -> str:
    """Stable ID from the job URL path, e.g. /laisvos-darbo-vietos/436/skelbimas/DV-21-996807138"""
    m = re.search(r"/(DV-[\w-]+)", href_path)
    if m:
        return f"uzt_{m.group(1)}"
    slug = re.sub(r"[^a-z0-9]+", "-", href_path.lower().strip("/"))[-60:]
    return f"uzt_{slug}"


# ── Scraping ──────────────────────────────────────────────────────────────────

def _fetch_with_playwright(url: str) -> str | None:
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=["--disable-blink-features=AutomationControlled"],
            )
            context = browser.new_context(
                user_agent=HEADERS["User-Agent"],
                extra_http_headers={
                    "Accept": HEADERS["Accept"],
                    "Accept-Language": HEADERS["Accept-Language"],
                },
            )
            page = context.new_page()
            page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            page.goto(url, wait_until="domcontentloaded", timeout=45000)
            try:
                page.wait_for_selector('a[href*="/skelbimas/"]', timeout=20000)
            except Exception:
                pass
            html = page.content()
            browser.close()
            return html
    except Exception as exc:
        log.error("Playwright fallback failed for %s: %s", url, exc)
        return None


def fetch_page(session: requests.Session, offset: int) -> str | None:
    if offset == 0:
        url = RESULTS_URL
        params = {"s": "60", "n": str(PAGE_SIZE)}
    else:
        url = f"{RESULTS_URL}/p{offset}?s=60;q=;n={PAGE_SIZE}"
        params = None

    for attempt in range(1, 4):
        try:
            resp = session.get(url, params=params, timeout=20)
            if resp.status_code == 403:
                log.warning("403 Forbidden — falling back to Playwright for offset %d", offset)
                return _fetch_with_playwright(resp.url)
            if resp.status_code == 429:
                wait = 2 ** attempt * 3
                log.warning("Rate limited — sleeping %ds", wait)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.text
        except Exception as exc:
            wait = 2 ** attempt
            if attempt < 3:
                log.warning("Attempt %d/3 failed: %s — retry in %ds", attempt, exc, wait)
                time.sleep(wait)
            else:
                log.error("Permanently failed at offset %d: %s", offset, exc)
    return None


def parse_cards(html: str, now_utc: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    results: list[dict] = []

    for card in soup.select('a[href*="/skelbimas/"]'):
        try:
            href = card.get("href", "")
            href_key = href.split("?")[0]
            if not href_key:
                continue

            job_url = BASE_URL + href_key
            job_id = make_job_id(href_key)

            title_el = card.select_one("strong")
            title = clean(title_el.get_text()) if title_el else ""
            if len(title) < 3:
                continue

            # Remaining lines after title: company, optional salary, location, then date metadata
            all_lines = [clean(l) for l in card.get_text("\n").split("\n") if clean(l)]
            data_lines = [
                l for l in all_lines
                if l != title and not l.startswith("Įkelta:") and not l.startswith("Galioja:")
            ]

            company   = data_lines[0] if data_lines else None
            salary_raw = next((l for l in data_lines[1:] if "€" in l), None)
            location   = next((l for l in data_lines[1:] if "€" not in l), None)

            results.append({
                "job_id": job_id,
                "source": SOURCE,
                "title": title,
                "company": company or None,
                "salary_raw": salary_raw or None,
                "location": location or None,
                "url": job_url,
                "scraped_at": now_utc,
            })
        except Exception as exc:
            log.warning("Card parse error: %s", exc)

    return results


def get_total(html: str) -> int:
    soup = BeautifulSoup(html, "lxml")
    el = soup.select_one(".total-results")
    if not el:
        return 0
    m = re.search(r"\d+", el.get_text())
    return int(m.group()) if m else 0


# ── Main ──────────────────────────────────────────────────────────────────────

def run() -> dict:
    log.info("UZT scraper starting")
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    now_utc = datetime.now(timezone.utc).isoformat()

    session = requests.Session(impersonate="chrome124")
    session.headers.update(HEADERS)

    # Load existing IDs
    existing_ids: set[str] = set()
    try:
        pg_offset = 0
        while True:
            rows = (
                supabase.table("raw_listings")
                .select("job_id")
                .eq("source", SOURCE)
                .range(pg_offset, pg_offset + 999)
                .execute()
                .data or []
            )
            existing_ids.update(r["job_id"] for r in rows)
            if len(rows) < 1000:
                break
            pg_offset += 1000
        log.info("Loaded %d existing %s job_ids", len(existing_ids), SOURCE)
    except Exception as exc:
        log.warning("Could not load existing IDs: %s", exc)

    total_found = 0
    total_inserted = 0

    for page_idx in range(MAX_PAGES):
        offset = page_idx * PAGE_SIZE
        html = fetch_page(session, offset)
        if html is None:
            break

        listings = parse_cards(html, now_utc)

        if not listings:
            log.info("No cards at offset %d — done", offset)
            break

        if page_idx == 0:
            grand_total = get_total(html)
            log.info("Total listings on UZT: %d", grand_total)

        total_found += len(listings)
        log.info("offset=%d: %d listings parsed", offset, len(listings))

        new_listings = [l for l in listings if l["job_id"] not in existing_ids]
        if new_listings:
            for i in range(0, len(new_listings), BATCH_SIZE):
                chunk = new_listings[i: i + BATCH_SIZE]
                supabase.table("raw_listings").upsert(chunk, on_conflict="job_id").execute()
            total_inserted += len(new_listings)
            existing_ids.update(l["job_id"] for l in new_listings)
        else:
            log.info("All listings on this page already exist — stopping early")
            break

        time.sleep(RATE_LIMIT_DELAY)

    log.info("UZT done: found=%d inserted=%d", total_found, total_inserted)
    return {"jobs_found": total_found, "jobs_inserted": total_inserted, "error": None}


if __name__ == "__main__":
    result = run()
    print(result)

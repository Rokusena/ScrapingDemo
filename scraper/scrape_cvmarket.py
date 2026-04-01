#!/usr/bin/env python3
"""
GaukDarba — CVmarket.lt scraper
CVmarket is a React SPA — plain HTTP returns no job cards.
Uses Playwright to render the page and parse article[data-component-jobid] cards.

Card structure:
  article[data-component-jobid]  → job ID from attribute
    a[href]                       → relative URL (prepend https://www.cvmarket.lt)
    h2                            → title
    texts[3] after badges         → company, city, salary (order varies)

Only 25 listings are exposed on the public listing page regardless of pagination params.
"""

import logging
import os
import time
from datetime import datetime, timezone

from bs4 import BeautifulSoup
from supabase import create_client

SOURCE = "cvmarket"
BASE_URL = "https://www.cvmarket.lt"
LIST_URL = f"{BASE_URL}/darbo-skelbimai"
BATCH_SIZE = 100

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  [cvmarket] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("gaukdarba.cvmarket")


def clean(text: str | None) -> str:
    if not text:
        return ""
    return " ".join(text.split()).strip()


def scrape_with_playwright(now_utc: str) -> list[dict]:
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    except ImportError:
        log.error("Playwright not installed. Run: pip install playwright && playwright install chromium")
        return []

    for attempt in range(1, 4):
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True,
                    args=["--no-sandbox", "--disable-dev-shm-usage"],
                )
                page = browser.new_page(
                    user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
                    viewport={"width": 1280, "height": 900},
                )
                page.goto(LIST_URL, wait_until="networkidle", timeout=30_000)
                try:
                    page.wait_for_selector("article[data-component-jobid]", timeout=10_000)
                except PWTimeout:
                    log.warning("Article selector timed out — parsing anyway")
                time.sleep(2)
                html = page.content()
                browser.close()

            soup = BeautifulSoup(html, "lxml")
            cards = soup.select("article[data-component-jobid]")
            log.info("Playwright found %d cards", len(cards))

            results: list[dict] = []
            for card in cards:
                try:
                    job_id_raw = card.get("data-component-jobid", "")
                    if not job_id_raw:
                        continue
                    job_id = f"cvmarket_{job_id_raw}"

                    link = card.select_one("a[href]")
                    href = link.get("href", "") if link else ""
                    url = href if href.startswith("http") else BASE_URL + href

                    h2 = card.select_one("h2")
                    title = clean(h2.get_text()) if h2 else ""
                    if len(title) < 3:
                        continue

                    # Strip badge texts (NAUJAS, liko N d.) then get company/city/salary
                    badges = {"NAUJAS", "SKUBU", "TOP"}
                    texts = [
                        t for t in (clean(s) for s in card.stripped_strings)
                        if t and t not in badges and not t.startswith("liko") and t != title
                    ]
                    company = texts[0] if texts else None
                    location = next(
                        (t for t in texts if any(c in t for c in ["Vilnius", "Kaunas", "Klaipėda", "Nuotolinis", "Remote", "sav."])),
                        None,
                    )
                    salary_raw = next(
                        (t for t in texts if "€" in t or "Eur" in t.lower()),
                        None,
                    )

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
                    log.warning("Card parse error: %s", exc)

            return results

        except Exception as exc:
            wait = 2 ** attempt
            if attempt < 3:
                log.warning("Playwright attempt %d/3 failed: %s — retry in %ds", attempt, exc, wait)
                time.sleep(wait)
            else:
                log.error("Playwright permanently failed: %s", exc)

    return []


def run() -> dict:
    log.info("CVmarket scraper starting")
    supabase = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )
    now_utc = datetime.now(timezone.utc).isoformat()

    listings = scrape_with_playwright(now_utc)
    total_found = len(listings)

    if not listings:
        log.warning("No listings extracted — aborting")
        return {"jobs_found": 0, "jobs_inserted": 0, "error": "No listings extracted"}

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
            supabase.table("raw_listings").upsert(
                new_listings[i: i + BATCH_SIZE], on_conflict="job_id"
            ).execute()
        total_inserted = len(new_listings)

    log.info("CVmarket done: found=%d inserted=%d", total_found, total_inserted)
    return {"jobs_found": total_found, "jobs_inserted": total_inserted, "error": None}


if __name__ == "__main__":
    result = run()
    print(result)

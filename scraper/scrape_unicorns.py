#!/usr/bin/env python3
"""
GaukDarba — Unicorns.lt scraper (Playwright, SPA)
Renders JS, then scrapes job listings from unicorns.lt/jobs.
Upserts to Supabase raw_listings with source='unicorns'.

Env vars required:
  SUPABASE_URL         — https://xxx.supabase.co
  SUPABASE_SERVICE_KEY — service-role key (bypasses RLS)

System requirements:
  playwright install chromium
"""

import hashlib
import logging
import os
import re
import time
from datetime import datetime, timezone

from supabase import create_client

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

SOURCE = "unicorns"
JOBS_URL = "https://unicorns.lt/jobs"
BATCH_SIZE = 100
MAX_RETRIES = 3

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


def make_job_id(external_id: str) -> str:
    return f"unicorns_{external_id}"


def extract_id(url: str, title: str) -> str:
    m = re.search(r"/(\d{4,})", url)
    if m:
        return m.group(1)
    slug = re.sub(r"[^a-z0-9]+", "-", (title or url).lower())[:40]
    return hashlib.md5(slug.encode()).hexdigest()[:12]


# ── Playwright scraping ───────────────────────────────────────────────────────

def scrape_with_playwright(now_utc: str) -> list[dict]:
    """Render the SPA with Playwright and extract job cards."""
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    except ImportError:
        log.error("Playwright not installed. Run: pip install playwright && playwright install chromium")
        return []

    results: list[dict] = []

    for attempt in range(1, MAX_RETRIES + 1):
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

                log.info("Navigating to %s", JOBS_URL)
                page.goto(JOBS_URL, wait_until="networkidle", timeout=30_000)

                # Wait for job cards to appear
                try:
                    page.wait_for_selector(
                        "[class*='job'], [class*='vacancy'], article, [data-testid*='job']",
                        timeout=10_000,
                    )
                except PWTimeout:
                    log.warning("Job cards selector timed out — parsing anyway")

                # Give JS extra time to render
                time.sleep(2)

                # Extract cards via evaluate
                cards_data = page.evaluate("""() => {
                    const selectors = [
                        'a[href*="/jobs/"]',
                        '[class*="JobCard"], [class*="job-card"], [class*="VacancyCard"]',
                        'article',
                    ];
                    for (const sel of selectors) {
                        const els = document.querySelectorAll(sel);
                        if (els.length > 2) {
                            return Array.from(els).map(el => ({
                                href: el.getAttribute('href') || el.querySelector('a')?.getAttribute('href') || '',
                                title: (el.querySelector('h2, h3, h4, [class*="title"]')?.textContent || el.textContent || '').trim().slice(0, 200),
                                company: (el.querySelector('[class*="company"], [class*="employer"]')?.textContent || '').trim().slice(0, 100),
                                location: (el.querySelector('[class*="location"], [class*="city"]')?.textContent || '').trim().slice(0, 100),
                                salary: (el.querySelector('[class*="salary"]')?.textContent || '').trim().slice(0, 100),
                            }));
                        }
                    }
                    return [];
                }""")

                browser.close()

                for card in (cards_data or []):
                    href = card.get("href", "")
                    title = clean(card.get("title", ""))
                    if not title or len(title) < 3:
                        continue

                    url = href if href.startswith("http") else f"https://unicorns.lt{href}"
                    external_id = extract_id(url, title)
                    job_id = make_job_id(external_id)

                    results.append({
                        "job_id": job_id,
                        "source": SOURCE,
                        "title": title,
                        "company": clean(card.get("company")) or None,
                        "salary_raw": clean(card.get("salary")) or None,
                        "location": clean(card.get("location")) or None,
                        "url": url,
                        "scraped_at": now_utc,
                    })

                log.info("Playwright extracted %d cards", len(results))
                return results

        except Exception as exc:
            wait = 2 ** attempt
            if attempt < MAX_RETRIES:
                log.warning("Playwright attempt %d/%d failed: %s — retry in %ds", attempt, MAX_RETRIES, exc, wait)
                time.sleep(wait)
            else:
                log.error("Playwright permanently failed: %s", exc)

    return results


# ── Main ──────────────────────────────────────────────────────────────────────

def run() -> dict:
    log.info("Unicorns scraper starting")
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    now_utc = datetime.now(timezone.utc).isoformat()

    listings = scrape_with_playwright(now_utc)
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

    # Upsert new
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

#!/usr/bin/env python3
"""
GaukDarba — CVmarket.lt scraper
CVmarket is a React SPA. We use two strategies in order:
  1. Network interception: capture the JSON API response the React app fetches
     for job listings. This is fast and gives structured data.
  2. HTML fallback: if no API response is captured, parse the rendered HTML
     (article[data-component-jobid] cards) as before.

Note: the public listing page only exposes 25 listings regardless of pagination.
The API may expose more — we'll find out from what gets intercepted.
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


# ── API response parser ───────────────────────────────────────────────────────

def _extract_job_list(data: object, url: str) -> list[dict] | None:
    """Try to pull a list of job dicts out of an unknown API payload."""
    if isinstance(data, list) and len(data) > 0:
        return data
    if isinstance(data, dict):
        for key in ("jobs", "vacancies", "data", "results", "items", "ads", "list", "rows"):
            val = data.get(key)
            if isinstance(val, list) and len(val) > 0:
                log.info("API key '%s' matched at %s", key, url[:80])
                return val
    return None


def _parse_api_job(raw: dict, now_utc: str) -> dict | None:
    """Map unknown API job fields to our schema. Returns None if unusable."""
    # Job ID
    job_id_raw = (
        raw.get("id") or raw.get("jobId") or raw.get("vacancyId")
        or raw.get("adId") or raw.get("job_id")
    )
    if not job_id_raw:
        return None
    job_id = f"cvmarket_{job_id_raw}"

    # Title
    title = clean(
        raw.get("title") or raw.get("position") or raw.get("jobTitle") or raw.get("name") or ""
    )
    if len(title) < 3:
        return None

    # URL
    url_raw = raw.get("url") or raw.get("link") or raw.get("href") or raw.get("slug") or ""
    if url_raw and not url_raw.startswith("http"):
        url_raw = BASE_URL + url_raw

    # Company
    company = clean(
        raw.get("company") or raw.get("employer") or raw.get("companyName")
        or raw.get("organizationName") or raw.get("firm") or ""
    ) or None

    # Location
    location = clean(
        raw.get("city") or raw.get("location") or raw.get("address")
        or raw.get("region") or raw.get("place") or ""
    ) or None

    # Salary — try to construct from range fields if present
    salary_raw = None
    if raw.get("salary"):
        salary_raw = clean(str(raw["salary"]))
    elif raw.get("salaryFrom") or raw.get("salaryTo"):
        lo = raw.get("salaryFrom") or ""
        hi = raw.get("salaryTo") or ""
        salary_raw = f"{lo}–{hi} €".strip("–€ ") or None
        if salary_raw:
            salary_raw += " €"

    return {
        "job_id": job_id,
        "source": SOURCE,
        "title": title,
        "company": company,
        "salary_raw": salary_raw,
        "location": location,
        "url": url_raw or None,
        "scraped_at": now_utc,
        "last_seen_at": now_utc,
    }


# ── HTML fallback parser ──────────────────────────────────────────────────────

def _parse_html_cards(html: str, now_utc: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    cards = soup.select("article[data-component-jobid]")
    log.info("HTML fallback: %d cards found", len(cards))

    results: list[dict] = []
    badges = {"NAUJAS", "SKUBU", "TOP"}

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

            texts = [
                t for t in (clean(s) for s in card.stripped_strings)
                if t and t not in badges and not t.startswith("liko") and t != title
            ]
            company = texts[0] if texts else None
            location = next(
                (t for t in texts if any(c in t for c in
                 ["Vilnius", "Kaunas", "Klaipėda", "Nuotolinis", "Remote", "sav."])),
                None,
            )
            salary_raw = next((t for t in texts if "€" in t or "Eur" in t.lower()), None)

            results.append({
                "job_id": job_id,
                "source": SOURCE,
                "title": title,
                "company": company or None,
                "salary_raw": salary_raw or None,
                "location": location or None,
                "url": url,
                "scraped_at": now_utc,
                "last_seen_at": now_utc,
            })
        except Exception as exc:
            log.warning("Card parse error: %s", exc)

    return results


# ── Playwright scraper with interception ──────────────────────────────────────

def scrape_with_playwright(now_utc: str) -> list[dict]:
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    except ImportError:
        log.error("Playwright not installed.")
        return []

    for attempt in range(1, 4):
        try:
            captured_api_jobs: list[dict] = []

            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True,
                    args=["--no-sandbox", "--disable-dev-shm-usage"],
                )
                page = browser.new_page(
                    user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
                    viewport={"width": 1280, "height": 900},
                )

                # Intercept all fetch/xhr responses and look for job listing JSON
                def on_response(response):
                    if response.request.resource_type not in ("fetch", "xhr"):
                        return
                    content_type = response.headers.get("content-type", "")
                    if "json" not in content_type:
                        return
                    try:
                        data = response.json()
                        jobs = _extract_job_list(data, response.url)
                        if jobs:
                            log.info("Intercepted %d items from %s", len(jobs), response.url[:100])
                            captured_api_jobs.extend(jobs)
                    except Exception:
                        pass

                page.on("response", on_response)

                page.goto(LIST_URL, wait_until="networkidle", timeout=30_000)
                try:
                    page.wait_for_selector("article[data-component-jobid]", timeout=10_000)
                except PWTimeout:
                    log.warning("Article selector timed out — parsing anyway")
                time.sleep(2)

                html = page.content()
                browser.close()

            # Strategy 1: use intercepted API data if we got any
            if captured_api_jobs:
                log.info("Using intercepted API data: %d raw items", len(captured_api_jobs))
                results = []
                seen_ids: set[str] = set()
                for raw in captured_api_jobs:
                    parsed = _parse_api_job(raw, now_utc)
                    if parsed and parsed["job_id"] not in seen_ids:
                        results.append(parsed)
                        seen_ids.add(parsed["job_id"])
                log.info("Parsed %d jobs from API", len(results))
                if results:
                    return results

            # Strategy 2: fall back to HTML parsing
            log.info("No usable API data captured — falling back to HTML parsing")
            return _parse_html_cards(html, now_utc)

        except Exception as exc:
            wait = 2 ** attempt
            if attempt < 3:
                log.warning("Playwright attempt %d/3 failed: %s — retry in %ds", attempt, exc, wait)
                time.sleep(wait)
            else:
                log.error("Playwright permanently failed: %s", exc)

    return []


# ── Main ──────────────────────────────────────────────────────────────────────

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
    if listings:
        # Upsert all (refreshes last_seen_at for known listings too)
        for i in range(0, len(listings), BATCH_SIZE):
            supabase.table("raw_listings").upsert(
                listings[i: i + BATCH_SIZE], on_conflict="job_id"
            ).execute()
        total_inserted = len(new_listings)

    log.info("CVmarket done: found=%d inserted=%d", total_found, total_inserted)
    return {"jobs_found": total_found, "jobs_inserted": total_inserted, "error": None}


if __name__ == "__main__":
    result = run()
    print(result)

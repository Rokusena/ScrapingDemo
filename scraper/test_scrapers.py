#!/usr/bin/env python3
"""
GaukDarba — local scraper test
Fetches live data from CV.lt, CVmarket, Unicorns, UZT.
Writes results to scrapers_test_output.txt. No Supabase needed.
"""

import re
import sys
import time
import json
import random
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

sys.stdout.reconfigure(encoding='utf-8')

OUTPUT_FILE = "scrapers_test_output.txt"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "lt-LT,lt;q=0.9,en;q=0.8",
}

def clean(text):
    if not text:
        return ""
    return " ".join(str(text).split()).strip()

def get(url):
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
        r.raise_for_status()
        return r
    except Exception as e:
        print(f"  HTTP error {url}: {e}")
        return None

def pw_get_html(url, wait_selector=None, wait_seconds=3):
    """Render a JS page with Playwright and return the HTML."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = browser.new_page(
            user_agent=HEADERS["User-Agent"],
            viewport={"width": 1280, "height": 900},
        )
        page.goto(url, wait_until="networkidle", timeout=30000)
        if wait_selector:
            try:
                page.wait_for_selector(wait_selector, timeout=8000)
            except PWTimeout:
                pass
        time.sleep(wait_seconds)
        html = page.content()
        browser.close()
        return html


# ── CV.lt ─────────────────────────────────────────────────────────────────────

def scrape_cvlt():
    print("Scraping CV.lt (/jobs) ...")
    results = []
    # paginate up to 5 pages
    for page_num in range(1, 6):
        url = f"https://www.cv.lt/jobs?page={page_num}" if page_num > 1 else "https://www.cv.lt/jobs"
        r = get(url)
        if not r:
            break
        soup = BeautifulSoup(r.text, "lxml")
        articles = soup.select("article[data-component=jobad]")
        if not articles:
            break
        for a in articles:
            texts = [t.strip() for t in a.stripped_strings if len(t.strip()) > 1]
            job_link = next(
                (l for l in a.select("a[href]") if re.search(r"-\d{6,}$", l.get("href", ""))),
                None,
            )
            url_job = ("https://www.cv.lt" + job_link.get("href")) if job_link else ""
            # texts layout: [age, title, company, city, salary, ...]
            title   = texts[1] if len(texts) > 1 else (texts[0] if texts else "")
            company = texts[2] if len(texts) > 2 else "-"
            location= texts[3] if len(texts) > 3 else "-"
            salary  = texts[4] if len(texts) > 4 else "-"
            if title:
                results.append({"title": title, "company": company, "location": location, "salary": salary, "url": url_job})
        print(f"  Page {page_num}: {len(articles)} articles (total so far: {len(results)})")
        time.sleep(1.5)
    return results


# ── CVmarket.lt ───────────────────────────────────────────────────────────────

def scrape_cvmarket():
    print("Scraping CVmarket.lt (Playwright) ...")
    results = []
    # CVmarket is a React SPA — render with Playwright
    try:
        html = pw_get_html(
            "https://www.cvmarket.lt/darbo-skelbimai",
            wait_selector="[class*='job'], [class*='vakanc'], h2, h3",
            wait_seconds=4,
        )
    except Exception as e:
        print(f"  Playwright failed: {e}")
        return []

    soup = BeautifulSoup(html, "lxml")

    # CVmarket renders job cards as <article> or li items with links
    cards = (
        soup.select("article") or
        soup.select("li[class*='job']") or
        soup.select("[class*='JobCard'], [class*='job-card']")
    )
    print(f"  Found {len(cards)} card elements after JS render")

    seen = set()
    for card in cards:
        try:
            link = card.select_one("a[href]")
            if not link:
                continue
            href = link.get("href", "")
            if href in seen:
                continue
            seen.add(href)
            url = href if href.startswith("http") else "https://www.cvmarket.lt" + href

            texts = [t.strip() for t in card.stripped_strings if len(t.strip()) > 1]
            if not texts:
                continue
            title = texts[0]
            company = texts[1] if len(texts) > 1 else "-"
            location = next((t for t in texts if any(c in t for c in ["Vilnius","Kaunas","Klaipėda","Nuotolinis","Remote"])), "-")
            salary = next((t for t in texts if "€" in t or "Eur" in t.lower()), "-")

            if len(title) < 4:
                continue
            results.append({"title": title, "company": company, "location": location, "salary": salary, "url": url})
        except Exception:
            pass

    # fallback: grab all links pointing to job ads
    if not results:
        for a in soup.select("a[href]"):
            href = a.get("href", "")
            if not re.search(r"/darbo-skelbimai/|/job/", href):
                continue
            title = clean(a.get_text())
            if len(title) < 4 or href in seen:
                continue
            seen.add(href)
            url = href if href.startswith("http") else "https://www.cvmarket.lt" + href
            results.append({"title": title, "company": "-", "location": "-", "salary": "-", "url": url})

    print(f"  Parsed {len(results)} listings")
    return results


# ── Unicorns.lt ───────────────────────────────────────────────────────────────

def scrape_unicorns():
    """Use Unicorns.lt JSON API: GET /api/more-job?page=N returns {rows: "<html>", totalResults: N}"""
    print("Scraping Unicorns.lt (JSON API) ...")
    results = []
    seen = set()
    BASE = "https://unicorns.lt"
    page_num = 1
    max_pages = 10  # cap at 10 pages (~120 listings) for the test

    while page_num <= max_pages:
        url = f"{BASE}/api/more-job" if page_num == 1 else f"{BASE}/api/more-job?page={page_num}"
        r = get(url)
        if not r:
            break
        try:
            data = r.json()
        except Exception as e:
            print(f"  JSON parse error at page {page_num}: {e}")
            break

        html_fragment = data.get("rows", "")
        total = data.get("totalResults", 0)

        if not html_fragment or data.get("noResults"):
            break

        soup = BeautifulSoup(html_fragment, "lxml")
        cards = soup.select(".card.listing") or soup.select(".listing") or soup.select(".card")

        if not cards:
            print(f"  No cards at page {page_num}, stopping.")
            break

        new_count = 0
        for card in cards:
            try:
                h3 = card.select_one("h3")
                title = clean(h3.get_text()) if h3 else ""
                if len(title) < 4:
                    continue

                link = card.select_one("a[href]")
                href = link.get("href", "") if link else ""
                if href in seen:
                    continue
                seen.add(href)
                job_url = href if href.startswith("http") else BASE + href

                company_el = card.select_one(".company")
                company_text = clean(company_el.get_text()) if company_el else "-"
                if ", " in company_text:
                    parts = company_text.rsplit(", ", 1)
                    company, location = parts[0], parts[1]
                else:
                    company, location = company_text, "-"

                salary_el = card.select_one(".label") or card.select_one("[class*='salary']")
                salary = clean(salary_el.get_text()) if salary_el else "-"
                if salary.lower() in ("n/a", ""):
                    salary = "-"

                results.append({"title": title, "company": company, "location": location, "salary": salary, "url": job_url})
                new_count += 1
            except Exception:
                pass

        print(f"  Page {page_num}: {len(cards)} cards, {new_count} new (total so far: {len(results)} / {total})")

        if new_count == 0:
            break

        page_num += 1
        time.sleep(1)

    print(f"  Parsed {len(results)} listings")
    return results


# ── UZT.lt ────────────────────────────────────────────────────────────────────

def scrape_uzt():
    """
    Scrape UZT.lt via direct HTTP GET to the results endpoint.
    URL: /laisvos-darbo-vietos/436/results?s=60&n=100
    Pagination: /laisvos-darbo-vietos/436/results/p{offset}?s=60;q=;n=100
    """
    print("Scraping UZT.lt (direct HTTP) ...")
    results = []
    seen = set()
    BASE = "https://uzt.lt"
    UZT_HEADERS = {**HEADERS, "Referer": f"{BASE}/laisvos-darbo-vietos/paieska/436"}
    max_pages = 5  # 5 × 100 = 500 listings for the test

    for page_idx in range(max_pages):
        offset = page_idx * 100
        if offset == 0:
            url = f"{BASE}/laisvos-darbo-vietos/436/results"
            params = {"s": "60", "n": "100"}
        else:
            url = f"{BASE}/laisvos-darbo-vietos/436/results/p{offset}"
            params = None
            url += "?s=60;q=;n=100"

        r = requests.get(url, headers=UZT_HEADERS, params=params, timeout=20) if params else get(url)
        if not r:
            break

        soup = BeautifulSoup(r.text, "lxml")
        cards = soup.select("a.list__item")

        if not cards:
            print(f"  No cards at offset {offset}, stopping.")
            break

        new_count = 0
        for card in cards:
            try:
                href = card.get("href", "")
                # Strip query params from href for dedup key
                href_key = href.split("?")[0]
                if href_key in seen:
                    continue
                seen.add(href_key)
                job_url = BASE + href if href.startswith("/") else href

                title_el = card.select_one(".title strong") or card.select_one(".title")
                title = clean(title_el.get_text()) if title_el else ""
                if len(title) < 4:
                    continue

                company_el = card.select_one(".company")
                company = clean(company_el.get_text()) if company_el else "-"

                salary_el = card.select_one(".salary")
                salary = clean(salary_el.get_text()) if salary_el else "-"
                if not salary:
                    salary = "-"

                location_el = card.select_one(".location")
                location = clean(location_el.get_text()) if location_el else "-"

                results.append({"title": title, "company": company, "location": location, "salary": salary, "url": job_url})
                new_count += 1
            except Exception:
                pass

        # Check total
        total_el = soup.select_one(".total-results")
        total_text = clean(total_el.get_text()) if total_el else ""
        import re as _re
        total_m = _re.search(r"\d+", total_text)
        total = int(total_m.group()) if total_m else 0

        print(f"  offset={offset}: {len(cards)} cards, {new_count} new (total so far: {len(results)} / {total})")

        if new_count == 0 or (total and len(results) >= total):
            break

        time.sleep(1.5)

    print(f"  Parsed {len(results)} listings")
    return results


# ── Output ────────────────────────────────────────────────────────────────────

def write_output(all_results):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = []
    lines.append("GaukDarba — Scraper Test Output")
    lines.append(f"Generated: {now}")
    lines.append("=" * 80)

    total = 0
    for source, listings in all_results.items():
        lines.append(f"\n{'━' * 80}")
        lines.append(f"  SOURCE: {source.upper()}   ({len(listings)} listings)")
        lines.append(f"{'━' * 80}\n")
        if not listings:
            lines.append("  (no listings parsed — site may require further selector tuning)\n")
            continue
        for i, job in enumerate(listings, 1):
            lines.append(f"[{i:03d}] {job['title']}")
            lines.append(f"       Company  : {job['company']}")
            lines.append(f"       Location : {job['location']}")
            lines.append(f"       Salary   : {job['salary']}")
            lines.append(f"       URL      : {job['url']}")
            lines.append("")
        total += len(listings)

    lines.append("=" * 80)
    lines.append(f"TOTAL: {total} listings across {len(all_results)} sources")
    lines.append("=" * 80)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"\nWrote {total} total listings to {OUTPUT_FILE}")


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"\n{'='*60}")
    print("  GaukDarba scraper test")
    print(f"  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"{'='*60}\n")

    results = {}
    results["cv.lt"]     = scrape_cvlt();     print()
    results["cvmarket"]  = scrape_cvmarket();  print()
    results["unicorns"]  = scrape_unicorns();  print()
    results["uzt"]       = scrape_uzt();       print()

    write_output(results)

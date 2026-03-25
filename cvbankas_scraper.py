"""
CVBankas.lt job listing scraper for Vilnius.
Uses Playwright (JS-rendered pages) + BeautifulSoup for parsing.

Phase 1: Scrapes all job listings from search results.
Phase 2 (later): Filter jobs and scrape individual detail pages.
"""

import csv
import logging
import os
import re
import time
import random
from datetime import datetime, timezone

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

# ── Config ───────────────────────────────────────────────────────────────────
BASE_URL = "https://www.cvbankas.lt"
START_URL = f"{BASE_URL}/?keyw=Vilnius&min_salary="
PAGE_URL_TEMPLATE = f"{BASE_URL}/?keyw=Vilnius&min_salary=&page={{page}}"
DATE_STAMP = datetime.now().strftime("%Y%m%d")

# Output folder
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cvbankas")
os.makedirs(OUT_DIR, exist_ok=True)

CSV_PATH = os.path.join(OUT_DIR, f"cvbankas_jobs_vilnius_{DATE_STAMP}.csv")
HTML_PATH = os.path.join(OUT_DIR, f"cvbankas_jobs_vilnius_{DATE_STAMP}.html")
SCREENSHOT_PATH = os.path.join(OUT_DIR, f"cvbankas_screenshot_{DATE_STAMP}.png")
ERROR_LOG = os.path.join(OUT_DIR, "errors.log")

CSV_FIELDS = [
    "job_id", "title", "company", "salary_raw", "salary_min", "salary_max",
    "salary_type", "location", "posted", "url", "scraped_utc",
]

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    filename=ERROR_LOG,
    filemode="w",
    level=logging.WARNING,
    format="%(asctime)s  %(levelname)s  %(message)s",
)
log = logging.getLogger(__name__)

console = logging.StreamHandler()
console.setLevel(logging.INFO)
console.setFormatter(logging.Formatter("%(asctime)s  %(message)s", datefmt="%H:%M:%S"))
logging.getLogger().addHandler(console)
logging.getLogger().setLevel(logging.INFO)


# ── Helpers ──────────────────────────────────────────────────────────────────
def clean_text(raw: str | None) -> str:
    if not raw:
        return ""
    return " ".join(raw.split()).strip()


def extract_job_id(article) -> str:
    """Pull job ID from article id='job_ad_13676911' or from href."""
    art_id = article.get("id", "")
    match = re.search(r"(\d+)$", art_id)
    if match:
        return match.group(1)
    # Fallback: from URL
    link = article.select_one("a.list_a")
    if link:
        href = link.get("href", "")
        m = re.search(r"/(\d+-\d+)$", href.rstrip("/"))
        if m:
            return m.group(1)
    return ""


def parse_salary(raw: str) -> tuple[str, str]:
    """Extract min and max from salary string like '1900-3400' or '2000'.
    Returns (min_salary, max_salary).
    """
    if not raw:
        return ("", "")
    numbers = re.findall(r"[\d]+", raw.replace(" ", ""))
    if len(numbers) >= 2:
        return (numbers[0], numbers[1])
    elif len(numbers) == 1:
        return (numbers[0], numbers[0])
    return ("", "")


def sleep_random():
    time.sleep(random.uniform(1.5, 3.5))


# ── Parsing ──────────────────────────────────────────────────────────────────
def parse_listings(html: str) -> list[dict]:
    """Parse all job listing rows from a search-results page."""
    soup = BeautifulSoup(html, "html.parser")
    now_utc = datetime.now(timezone.utc).isoformat()
    results = []

    for article in soup.select("article.list_article"):
        try:
            # URL
            link_tag = article.select_one("a.list_a")
            if not link_tag:
                continue
            href = link_tag.get("href", "")
            full_url = href if href.startswith("http") else BASE_URL + href

            # Job ID
            job_id = extract_job_id(article)

            # Title
            h3 = article.select_one("h3.list_h3")
            title = clean_text(h3.get_text()) if h3 else ""

            # Company
            company_span = article.select_one("span.heading_secondary span")
            company = clean_text(company_span.get_text()) if company_span else ""

            # Salary
            salary_amount_el = article.select_one("span.salary_amount")
            salary_amount = clean_text(salary_amount_el.get_text()) if salary_amount_el else ""

            salary_period_el = article.select_one("span.salary_period")
            salary_period = clean_text(salary_period_el.get_text()) if salary_period_el else ""

            salary_calc_el = article.select_one("span.salary_calculation")
            salary_type = clean_text(salary_calc_el.get_text()) if salary_calc_el else ""

            salary_raw = f"{salary_amount} {salary_period}".strip()
            if salary_type:
                salary_raw += f" {salary_type}"
            salary_raw = salary_raw.strip()

            salary_min, salary_max = parse_salary(salary_amount)

            # Location
            city_el = article.select_one("span.list_city")
            location = clean_text(city_el.get_text()) if city_el else ""

            # Posted time
            posted_el = article.select_one("span.txt_list_2")
            posted = clean_text(posted_el.get_text()) if posted_el else ""

            results.append({
                "job_id": job_id,
                "title": title,
                "company": company,
                "salary_raw": salary_raw,
                "salary_min": salary_min,
                "salary_max": salary_max,
                "salary_type": salary_type,
                "location": location,
                "posted": posted,
                "url": full_url,
                "scraped_utc": now_utc,
            })

        except Exception as exc:
            snippet = clean_text(article.get_text())[:120]
            log.warning("Failed to parse job listing: %s | snippet: %s", exc, snippet)

    return results


def has_next_page(html: str, current_page: int) -> bool:
    """Check if a next-page link exists."""
    soup = BeautifulSoup(html, "html.parser")
    next_page = current_page + 1
    for a in soup.select("a[href]"):
        href = a.get("href", "")
        if f"page={next_page}" in href:
            return True
    return False


# ── HTML report ──────────────────────────────────────────────────────────────
def write_html_report(listings: list[dict]):
    """Generate a styled HTML table from the job listings."""
    rows_html = ""
    for i, r in enumerate(listings):
        row_class = "even" if i % 2 == 0 else "odd"
        salary = r["salary_raw"] if r["salary_raw"] else "\u2014"
        rows_html += f"""        <tr class="{row_class}">
            <td>{i + 1}</td>
            <td><a href="{r['url']}" target="_blank">{r['title']}</a></td>
            <td>{r['company']}</td>
            <td class="num">{salary}</td>
            <td>{r['location']}</td>
            <td>{r['posted']}</td>
        </tr>\n"""

    html = f"""<!DOCTYPE html>
<html lang="lt">
<head>
<meta charset="utf-8">
<title>CVBankas Vilnius darbai \u2014 {DATE_STAMP}</title>
<style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f9; padding: 30px; color: #333; }}
    h1 {{ margin-bottom: 6px; font-size: 1.6rem; }}
    .subtitle {{ color: #777; margin-bottom: 20px; font-size: 0.9rem; }}
    table {{ width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }}
    th {{ background: #2c3e50; color: #fff; padding: 12px 14px; text-align: left; font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; }}
    td {{ padding: 10px 14px; font-size: 0.9rem; border-bottom: 1px solid #eee; }}
    tr.odd {{ background: #f9fbfd; }}
    tr:hover {{ background: #eef3fa; }}
    .num {{ text-align: right; font-variant-numeric: tabular-nums; }}
    a {{ color: #2980b9; text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
</style>
</head>
<body>
<h1>CVBankas \u2014 darbo skelbimai Vilniuje</h1>
<p class="subtitle">Surikiuota pagal atlyginim\u0105 (did\u017eiausias vir\u0161uje) &bull; {len(listings)} skelbimai &bull; {DATE_STAMP}</p>
<table>
    <thead>
        <tr>
            <th>#</th>
            <th>Pareigos</th>
            <th>\u012emon\u0117</th>
            <th>Atlyginimas</th>
            <th>Vieta</th>
            <th>Paskelbta</th>
        </tr>
    </thead>
    <tbody>
{rows_html}    </tbody>
</table>
</body>
</html>"""

    with open(HTML_PATH, "w", encoding="utf-8") as f:
        f.write(html)


# ── Main scraper ─────────────────────────────────────────────────────────────
def run():
    all_listings: list[dict] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1920, "height": 1080},
            locale="lt-LT",
        )
        page = context.new_page()

        # ── First page ────────────────────────────────────────────────────
        logging.info("Loading first page: %s", START_URL)
        page.goto(START_URL, wait_until="networkidle", timeout=60_000)

        # Dismiss cookie banner if present
        try:
            cookie_btn = page.locator("button:has-text('Sutinku'), button:has-text('Priimti'), #onetrust-accept-btn-handler, .cookie-accept, #CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll")
            cookie_btn.first.click(timeout=5_000)
            logging.info("Cookie banner dismissed.")
            time.sleep(1)
        except PlaywrightTimeout:
            pass
        except Exception:
            pass

        # Wait for job listings to appear
        try:
            page.wait_for_selector("article.list_article", timeout=15_000)
        except PlaywrightTimeout:
            logging.warning("No job listings found on first page — site may be blocking.")

        # Screenshot of the first results page
        page.screenshot(path=SCREENSHOT_PATH, full_page=True)
        logging.info("Screenshot saved: %s", SCREENSHOT_PATH)

        # ── Paginate ──────────────────────────────────────────────────────
        current_page = 1
        while True:
            html = page.content()
            listings = parse_listings(html)
            logging.info("Page %d: %d listings found", current_page, len(listings))

            if not listings:
                logging.info("No listings on page %d — stopping.", current_page)
                break

            all_listings.extend(listings)

            if not has_next_page(html, current_page):
                logging.info("No next-page link after page %d — done.", current_page)
                break

            current_page += 1
            next_url = PAGE_URL_TEMPLATE.format(page=current_page)
            logging.info("Navigating to page %d: %s", current_page, next_url)
            sleep_random()

            try:
                page.goto(next_url, wait_until="networkidle", timeout=60_000)
                page.wait_for_selector("article.list_article", timeout=15_000)
            except PlaywrightTimeout:
                logging.warning("Timeout loading page %d — stopping.", current_page)
                break

        browser.close()

    # ── Sort by salary (highest first) ───────────────────────────────────
    all_listings.sort(
        key=lambda r: int(r["salary_max"]) if r["salary_max"] else 0,
        reverse=True,
    )

    # ── Write CSV ────────────────────────────────────────────────────────
    logging.info("Total job listings scraped: %d", len(all_listings))
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(all_listings)
    logging.info("CSV saved: %s", CSV_PATH)

    # ── Write HTML report ────────────────────────────────────────────────
    write_html_report(all_listings)
    logging.info("HTML report saved: %s", HTML_PATH)


if __name__ == "__main__":
    run()

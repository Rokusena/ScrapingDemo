"""
Aruodas.lt apartment rental scraper.
Uses Playwright (Cloudflare requires JS) + BeautifulSoup for parsing.
"""

import csv
import logging
import re
import time
import random
from datetime import datetime, timezone

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

# ── Config ───────────────────────────────────────────────────────────────────
BASE_URL = "https://www.aruodas.lt"
START_URL = f"{BASE_URL}/butu-nuoma/vilniuje/pilaiteje/"
PAGE_URL_TEMPLATE = f"{BASE_URL}/butu-nuoma/vilniuje/pilaiteje/puslapis/{{page}}/"
DATE_STAMP = datetime.now().strftime("%Y%m%d")
CSV_PATH = f"aruodas_rentals_pilaitė_{DATE_STAMP}.csv"
HTML_PATH = f"aruodas_rentals_pilaitė_{DATE_STAMP}.html"
SCREENSHOT_PATH = f"aruodas_screenshot_{DATE_STAMP}.png"
ERROR_LOG = "errors.log"

CSV_FIELDS = [
    "listing_id", "title", "price_eur", "area_m2", "eur_per_sqm", "rooms",
    "floor", "district", "city", "street", "url", "scraped_utc",
]

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    filename=ERROR_LOG,
    filemode="w",
    level=logging.WARNING,
    format="%(asctime)s  %(levelname)s  %(message)s",
)
log = logging.getLogger(__name__)

# Also log INFO+ to console
console = logging.StreamHandler()
console.setLevel(logging.INFO)
console.setFormatter(logging.Formatter("%(asctime)s  %(message)s", datefmt="%H:%M:%S"))
logging.getLogger().addHandler(console)
logging.getLogger().setLevel(logging.INFO)


# ── Helpers ──────────────────────────────────────────────────────────────────
def clean_price(raw: str) -> str:
    """Return numeric price string or '' if unavailable."""
    if not raw:
        return ""
    text = raw.strip().lower()
    # Lithuanian for "price on request" or similar
    if any(kw in text for kw in ["pageidavimu", "sutartin", "request"]):
        return ""
    digits = re.sub(r"[^\d]", "", text)
    return digits if digits else ""


def clean_text(raw: str | None) -> str:
    if not raw:
        return ""
    return " ".join(raw.split()).strip()


def extract_listing_id(url: str) -> str:
    """Pull the numeric ID from a listing URL, e.g. '4-1460923' from the slug."""
    match = re.search(r"(\d+-\d+)", url)
    return match.group(1) if match else ""


def parse_address(link_tag) -> tuple[str, str, str, str]:
    """Parse address from an <a> tag whose text is 'City, District<br/>Street'.
    Returns (title, city, district, street).
    """
    # The <a> contains text like "Vilnius, Fabijoniškės" then <br/> then "Ateities g."
    # get_text() collapses that; we need to split on the <br/>
    parts_raw = []
    for child in link_tag.children:
        if isinstance(child, str):
            text = child.strip()
            if text:
                parts_raw.append(text)
        # <br/> tags separate city/district from street

    # parts_raw is typically ["Vilnius, Fabijoniškės", "Ateities g."]
    city = ""
    district = ""
    street = ""

    if parts_raw:
        # First part: "City, District"
        city_district = parts_raw[0]
        cd_parts = [p.strip() for p in city_district.split(",")]
        city = cd_parts[0] if cd_parts else ""
        district = cd_parts[1] if len(cd_parts) > 1 else ""
        # Second part: street (after <br/>)
        street = parts_raw[1] if len(parts_raw) > 1 else ""

    # Build a clean title with proper separators
    title_parts = [p for p in [city, district, street] if p]
    title = ", ".join(title_parts)
    return title, city, district, street


def sleep_random():
    time.sleep(random.uniform(1.5, 3.5))


# ── Parsing ──────────────────────────────────────────────────────────────────
def parse_listings(html: str) -> list[dict]:
    """Parse all listing rows from a search-results page."""
    soup = BeautifulSoup(html, "html.parser")
    rows = soup.select("div.object-row")
    results = []
    now_utc = datetime.now(timezone.utc).isoformat()

    for row in rows:
        try:
            # Link & address
            link_tag = row.select_one(".list-adress-v2 h3 a")
            if not link_tag:
                continue

            href = link_tag.get("href", "")
            full_url = href if href.startswith("http") else BASE_URL + href
            listing_id = extract_listing_id(href)
            title, city, district, street = parse_address(link_tag)

            # Price
            price_tag = row.select_one(".list-item-price-v2")
            price_eur = clean_price(price_tag.get_text() if price_tag else "")

            # Area
            area_tag = row.select_one(".list-AreaOverall-v2")
            area_m2 = clean_text(area_tag.get_text()) if area_tag else ""

            # Rooms
            rooms_tag = row.select_one(".list-RoomNum-v2")
            rooms = clean_text(rooms_tag.get_text()) if rooms_tag else ""

            # Floor
            floor_tag = row.select_one(".list-Floors-v2")
            floor = clean_text(floor_tag.get_text()) if floor_tag else ""

            # Compute €/m²
            eur_per_sqm = ""
            if price_eur and area_m2:
                try:
                    eur_per_sqm = round(float(price_eur) / float(area_m2), 2)
                except (ValueError, ZeroDivisionError):
                    pass

            results.append({
                "listing_id": listing_id,
                "title": title,
                "price_eur": price_eur,
                "area_m2": area_m2,
                "eur_per_sqm": eur_per_sqm,
                "rooms": rooms,
                "floor": floor,
                "district": district,
                "city": city,
                "street": street,
                "url": full_url,
                "scraped_utc": now_utc,
            })

        except Exception as exc:
            snippet = clean_text(row.get_text())[:120]
            log.warning("Failed to parse listing row: %s | snippet: %s", exc, snippet)

    return results


def has_next_page(html: str, current_page: int) -> bool:
    """Check if a next-page link exists."""
    soup = BeautifulSoup(html, "html.parser")
    next_page = current_page + 1
    for a in soup.select("a[href]"):
        if f"/puslapis/{next_page}/" in a.get("href", ""):
            return True
    return False


# ── HTML report ──────────────────────────────────────────────────────────────
def write_html_report(listings: list[dict]):
    """Generate a styled HTML table from the listings."""
    rows_html = ""
    for i, r in enumerate(listings):
        row_class = "even" if i % 2 == 0 else "odd"
        price = f"{int(r['price_eur']):,}" if r["price_eur"] else "—"
        eur_sqm = r["eur_per_sqm"] if r["eur_per_sqm"] else "—"
        rows_html += f"""        <tr class="{row_class}">
            <td>{i + 1}</td>
            <td>{r['street']}</td>
            <td class="num">{price} &euro;</td>
            <td class="num">{r['area_m2']} m&sup2;</td>
            <td class="num highlight">{eur_sqm} &euro;/m&sup2;</td>
            <td class="num">{r['rooms']}</td>
            <td class="num">{r['floor']}</td>
            <td><a href="{r['url']}" target="_blank">Atidaryti</a></td>
        </tr>\n"""

    html = f"""<!DOCTYPE html>
<html lang="lt">
<head>
<meta charset="utf-8">
<title>Pilait\u0117 nuoma — {DATE_STAMP}</title>
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
    .highlight {{ font-weight: 700; color: #27ae60; }}
    a {{ color: #2980b9; text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
</style>
</head>
<body>
<h1>Vilnius, Pilait\u0117 — but\u0173 nuoma</h1>
<p class="subtitle">Surikiuota pagal kain\u0105 u\u017e m&sup2; (pigiausi vir\u0161uje) &bull; {len(listings)} skelbimai &bull; {DATE_STAMP}</p>
<table>
    <thead>
        <tr>
            <th>#</th>
            <th>Gatv\u0117</th>
            <th>Kaina</th>
            <th>Plotas</th>
            <th>&euro;/m&sup2;</th>
            <th>Kamb.</th>
            <th>Auk\u0161tas</th>
            <th>Nuoroda</th>
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
        page.goto(START_URL, wait_until="domcontentloaded", timeout=60_000)

        # Dismiss cookie banner if present
        try:
            page.click("#onetrust-reject-all-handler", timeout=5_000)
            logging.info("Cookie banner dismissed.")
            time.sleep(1)
        except PlaywrightTimeout:
            pass

        # Wait for listings to appear
        try:
            page.wait_for_selector("div.object-row", timeout=15_000)
        except PlaywrightTimeout:
            logging.warning("No listing rows found on first page — site may be blocking.")

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
                page.goto(next_url, wait_until="domcontentloaded", timeout=60_000)
                page.wait_for_selector("div.object-row", timeout=15_000)
            except PlaywrightTimeout:
                logging.warning("Timeout loading page %d — stopping.", current_page)
                break

        browser.close()

    # ── Sort by €/m² (cheapest first) ──────────────────────────────────────
    all_listings.sort(key=lambda r: float(r["eur_per_sqm"]) if r["eur_per_sqm"] else float("inf"))

    # ── Write CSV ─────────────────────────────────────────────────────────
    logging.info("Total listings scraped: %d", len(all_listings))
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(all_listings)
    logging.info("CSV saved: %s", CSV_PATH)

    # ── Write HTML report ─────────────────────────────────────────────────
    write_html_report(all_listings)
    logging.info("HTML report saved: %s", HTML_PATH)


if __name__ == "__main__":
    run()

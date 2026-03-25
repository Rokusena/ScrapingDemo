import csv
import glob
import os
import random
import re
import time
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup


TARGET_JOB_IDS_RAW = """
13640339, 13705505, 13694389, 13706229, 13717593, 13685943, 13745991, 13716569, 13715103, 13694105, 13694103, 13663223, 13683691, 13750065, 13705503, 13705197, 13717509, 13713175, 13713241, 13713017, 13716775, 13682663, 13749131, 13571256, 13736479, 13673449, 13740497, 13722327, 13680221, 13722841, 13618201, 13740891, 13748805, 9804975, 13726333, 13733039, 13732801, 13717061, 13694007, 13748967, 13500505, 13522521, 13557508, 13734471, 13676445, 13700265, 13699389, 13702549, 13726231, 13681239, 13540655, 13745703, 13750639, 13749675, 13749669, 13699115, 13749639, 13746671, 13734369, 13734371, 13692521, 13693643, 13582016, 13679739, 13666861, 13723013, 13749327, 13714291, 13224285, 13663559, 13582976, 13721965, 13680361, 13409158, 10957530, 13697171, 13176664, 13717627, 13746725, 13751101, 13743687, 13666355, 13733817, 13676753, 13713495, 13510903, 13743041, 13725609, 13673383, 13750705
"""

TARGET_JOB_IDS = {
    token.strip()
    for token in TARGET_JOB_IDS_RAW.split(",")
    if token.strip().isdigit()
}

DATE_STAMP = datetime.now().strftime("%Y%m%d")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CVBANKAS_DIR = os.path.join(BASE_DIR, "cvbankas")

OUTPUT_CSV = os.path.join(CVBANKAS_DIR, f"cvbankas_selected_jobs_{DATE_STAMP}.csv")
MISSING_IDS_CSV = os.path.join(CVBANKAS_DIR, f"cvbankas_missing_ids_{DATE_STAMP}.csv")

OUTPUT_FIELDS = [
    "job_id",
    "url",
    "source_title",
    "source_company",
    "source_salary_raw",
    "source_location",
    "source_posted",
    "detail_title",
    "detail_company",
    "detail_salary",
    "detail_location",
    "detail_posted",
    "detail_description",
    "http_status",
    "error",
    "scraped_utc",
]


def clean_text(raw: str | None) -> str:
    if not raw:
        return ""
    return " ".join(raw.split()).strip()


def find_latest_jobs_csv() -> str:
    pattern = os.path.join(CVBANKAS_DIR, "cvbankas_jobs_*.csv")
    matches = glob.glob(pattern)
    if not matches:
        raise FileNotFoundError("No source file found matching cvbankas/cvbankas_jobs_*.csv")
    return max(matches, key=os.path.getmtime)


def extract_job_id_from_url(url: str) -> str:
    if not url:
        return ""
    match = re.search(r"/(?:\d+-)?(\d+)(?:[/?#]|$)", url)
    if match:
        return match.group(1)
    return ""


def load_source_matches(source_csv_path: str) -> tuple[list[dict], set[str]]:
    matches: list[dict] = []
    matched_ids: set[str] = set()

    with open(source_csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            url = (row.get("url") or "").strip()
            row_job_id = (row.get("job_id") or "").strip()
            job_id = row_job_id if row_job_id.isdigit() else extract_job_id_from_url(url)

            if job_id in TARGET_JOB_IDS and url:
                matched_ids.add(job_id)
                matches.append(
                    {
                        "job_id": job_id,
                        "url": url,
                        "source_title": clean_text(row.get("title")),
                        "source_company": clean_text(row.get("company")),
                        "source_salary_raw": clean_text(row.get("salary_raw")),
                        "source_location": clean_text(row.get("location")),
                        "source_posted": clean_text(row.get("posted")),
                    }
                )

    return matches, matched_ids


def pick_company(soup: BeautifulSoup) -> str:
    selectors = [
        "a[href*='siulo-darba']",
        "a[href*='/4-']",
    ]
    for selector in selectors:
        tag = soup.select_one(selector)
        if tag:
            text = clean_text(tag.get_text())
            if text:
                return text
    return ""


def pick_location(page_text: str) -> str:
    location_match = re.search(
        r"\b(Vilnius|Kaunas|Klaipėda|Šiauliai|Panevėžys|Alytus|Marijampolė|Utena|Telšiai|Tauragė)\b",
        page_text,
        flags=re.IGNORECASE,
    )
    if not location_match:
        return ""
    return location_match.group(1)


def pick_posted(page_text: str) -> str:
    patterns = [
        r"Liko\s+\d+\s+dienos",
        r"prieš\s+\d+\s+(?:val\.|d\.|sav\.|mėn\.)",
    ]
    for pattern in patterns:
        match = re.search(pattern, page_text, flags=re.IGNORECASE)
        if match:
            return clean_text(match.group(0))
    return ""


def pick_salary(page_text: str) -> str:
    patterns = [
        r"\d[\d\s]*\s*-\s*\d[\d\s]*\s*€\/?(?:mėn\.|mon\.)\s*(?:gross|neatskaičius\s+mokesčių|į\s+rankas)?",
        r"\d[\d\s]*\s*€\/?(?:mėn\.|mon\.)\s*(?:gross|neatskaičius\s+mokesčių|į\s+rankas)?",
    ]
    for pattern in patterns:
        match = re.search(pattern, page_text, flags=re.IGNORECASE)
        if match:
            return clean_text(match.group(0))
    return ""


def pick_description(soup: BeautifulSoup) -> str:
    description_candidates = [
        "div[itemprop='description']",
        ".jobad_txt",
        ".jobad_content",
        ".jobad",
    ]
    for selector in description_candidates:
        block = soup.select_one(selector)
        if block:
            text = clean_text(block.get_text(" ", strip=True))
            if len(text) > 80:
                return text

    paragraphs = [
        clean_text(p.get_text(" ", strip=True))
        for p in soup.select("p")
    ]
    paragraphs = [p for p in paragraphs if len(p) > 60]
    if paragraphs:
        joined = " ".join(paragraphs)
        return joined[:4000]

    return ""


def scrape_detail(url: str, session: requests.Session) -> dict:
    try:
        response = session.get(url, timeout=30)
        http_status = str(response.status_code)
        response.raise_for_status()
    except Exception as exc:
        return {
            "detail_title": "",
            "detail_company": "",
            "detail_salary": "",
            "detail_location": "",
            "detail_posted": "",
            "detail_description": "",
            "http_status": "",
            "error": clean_text(str(exc)),
        }

    soup = BeautifulSoup(response.text, "html.parser")
    page_text = clean_text(soup.get_text(" ", strip=True))

    title_tag = soup.select_one("h1")
    detail_title = clean_text(title_tag.get_text()) if title_tag else ""

    return {
        "detail_title": detail_title,
        "detail_company": pick_company(soup),
        "detail_salary": pick_salary(page_text),
        "detail_location": pick_location(page_text),
        "detail_posted": pick_posted(page_text),
        "detail_description": pick_description(soup),
        "http_status": http_status,
        "error": "",
    }


def save_missing_ids(missing_ids: list[str]):
    with open(MISSING_IDS_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["job_id"])
        writer.writeheader()
        for job_id in missing_ids:
            writer.writerow({"job_id": job_id})


def run():
    os.makedirs(CVBANKAS_DIR, exist_ok=True)

    source_csv = find_latest_jobs_csv()
    print(f"Using source CSV: {source_csv}")
    print(f"Target IDs provided: {len(TARGET_JOB_IDS)}")

    matched_rows, matched_ids = load_source_matches(source_csv)
    missing_ids = sorted(TARGET_JOB_IDS - matched_ids)

    print(f"Matched IDs in source file: {len(matched_rows)}")
    print(f"Missing IDs in source file: {len(missing_ids)}")

    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "lt-LT,lt;q=0.9,en-US;q=0.8,en;q=0.7",
        }
    )

    scraped_rows = []
    for index, base_row in enumerate(matched_rows, start=1):
        print(f"[{index}/{len(matched_rows)}] Scraping {base_row['job_id']}")
        detail = scrape_detail(base_row["url"], session)
        scraped_rows.append(
            {
                **base_row,
                **detail,
                "scraped_utc": datetime.now(timezone.utc).isoformat(),
            }
        )
        time.sleep(random.uniform(0.5, 1.2))

    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(scraped_rows)

    save_missing_ids(missing_ids)

    print(f"Saved selected jobs to: {OUTPUT_CSV}")
    print(f"Saved missing IDs to: {MISSING_IDS_CSV}")


if __name__ == "__main__":
    run()

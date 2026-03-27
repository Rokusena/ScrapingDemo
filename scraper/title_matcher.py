#!/usr/bin/env python3
"""
GaukDarba — Title matcher  (Phase 1 of 2-phase matching pipeline)

3-Layer Funnel:
  Layer 1 (SQL):         Filter by city/salary at the DB level    → ~9k → ~3k
  Layer 2 (keywords):    Deterministic title whitelist/blacklist   → ~3k → ~50-100
  Layer 3 (LLM):         GPT-4o-mini scoring on survivors only    → ~50 → ~10-20

Flow:
  1. Load all active users with active job_preferences
  2. For each user:
     a. SQL-prefilter today's listings by city + salary (Layer 1)
     b. Deterministic keyword filter on titles (Layer 2)
     c. Send survivors in batches of 25 to GPT-4o-mini (Layer 3)
  3. Keep matches with score >= 5
  4. Insert into `matches` table  (skip user+job_id pairs already matched today)
  5. Return {user_id: [job_ids]} for the detail scraper (Phase 2)

Required env vars:
  OPENAI_API_KEY       — OpenAI secret key
  SUPABASE_URL         — https://xxx.supabase.co
  SUPABASE_SERVICE_KEY — service-role key (bypasses RLS)
"""

import json
import logging
import os
import re
import time
from datetime import datetime, timezone

from openai import OpenAI
from supabase import create_client

# ── Config ────────────────────────────────────────────────────────────────────

OPENAI_API_KEY       = os.environ["OPENAI_API_KEY"]
SUPABASE_URL         = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

MODEL             = "gpt-4o-mini"
BATCH_SIZE        = 25     # job titles per OpenAI call (smaller = more accurate)
MIN_SCORE         = 5      # minimum title_score to keep a match
INTER_CALL_DELAY  = 0.5    # seconds between OpenAI calls (rate-limit courtesy)

# ── Layer 1: City / location constants ────────────────────────────────────────

# Lithuanian nominative → locative forms used on cvbankas
CITY_LOCATIVE_MAP = {
    "Vilnius":    ["vilniuje", "vilnius"],
    "Kaunas":     ["kaune", "kaunas"],
    "Klaipėda":   ["klaipėdoje", "klaipėda"],
    "Šiauliai":   ["šiauliuose", "šiauliai"],
    "Panevėžys":  ["panevėžyje", "panevėžys"],
}

REMOTE_KEYWORDS = ["remote", "nuotoliniu", "nuotolinis", "nuotoliu", "hibrid", "hybrid"]

# ── Layer 2: Role keyword map + blacklist ─────────────────────────────────────

ROLE_KEYWORD_MAP = {
    "frontend developer": {
        # Lithuanian stems (catches -as/-a/-ą inflections)
        "programuotoj", "kūrėj", "programavim",
        # English
        "developer", "engineer", "frontend", "front-end", "front end",
        "fullstack", "full-stack", "full stack",
        "react", "javascript", "typescript", "angular", "vue",
        "web ", "ui ", "ux", "designer",
    },
    "backend developer": {
        "programuotoj", "kūrėj", "programavim",
        "developer", "engineer", "backend", "back-end", "back end",
        "fullstack", "full-stack", "full stack",
        "python", "java", "node", ".net", "golang", "go ",
        "devops", "cloud", "api",
    },
    "fullstack developer": {
        "programuotoj", "kūrėj", "programavim",
        "developer", "engineer",
        "frontend", "front-end", "front end",
        "backend", "back-end", "back end",
        "fullstack", "full-stack", "full stack",
        "react", "javascript", "typescript", "angular", "vue",
        "python", "java", "node", ".net",
        "web ", "devops", "cloud",
    },
    "data scientist": {
        "programuotoj", "kūrėj", "analitikas", "analitik",
        "data", "scientist", "machine learning", "ml ",
        "analyst", "analytics", "python", "duomenų",
    },
    "devops engineer": {
        "programuotoj", "kūrėj", "inžinier",
        "devops", "sre", "cloud", "infrastructure",
        "engineer", "developer", "kubernetes", "docker",
        "aws", "azure", "gcp", "linux", "administratori",
    },
    "qa engineer": {
        "testuotoj", "testavim", "kokybės",
        "qa", "quality", "test", "tester", "automation",
        "engineer", "developer",
    },
    "project manager": {
        "projektų vadov", "vadov", "vadybinink",
        "project manager", "product manager", "scrum", "agile",
        "delivery manager", "team lead",
    },
}

# Title stems that are NEVER relevant to IT/dev roles
TITLE_BLACKLIST = {
    "vairuotoj", "kurjer", "sandėl", "statybinink", "valytoj",
    "pardavim", "pardavėj",
    "buhalter", "virėj", "kepėj",
    "siuvėj", "mechani", "elektrik", "suvirintoj",
    "pakuotoj", "montuotoj", "gamybos darbuotoj",
    "slaugytoj", "gydytoj", "vaistinink",
    "apsaugos darbuotoj", "tiekėj", "operatori",
    "kasininк", "kasinink", "padavėj", "barmen",
    "konditer", "florist", "kirpėj",
}

# ── Layer 3: LLM prompt ──────────────────────────────────────────────────────

SYSTEM_PROMPT = (
    "Tu esi darbo skelbimų relevancijos vertintojas. Gauni kandidato profilį ir darbo skelbimų sąrašą.\n\n"
    "KANDIDATO PROFILIS:\n"
    "- Pageidaujama pozicija: {desired_position}\n"
    "- Įgūdžiai: {skills}\n"
    "- Pageidaujami miestai: {preferred_cities}\n"
    "- Min. atlyginimas (neatskaičius mokesčių): {preferred_salary_min} €/mėn.\n"
    "- Patirties lygis: {experience_level}\n"
    "- Kalbos: {languages}\n"
    "- Darbo būdas: {keywords}\n\n"
    "TAISYKLĖS:\n"
    "1. Grąžink TIK skelbimus, kurie yra PROGRAMAVIMO/IT KŪRIMO srityje ir atitinka kandidato tikslinę poziciją.\n"
    "2. ATMESTI visus skelbimus, kurie NĖRA IT/programavimo sritys: vairuotojai, sandėlininkai, "
    "pardavimų vadybininkai, statybininkai, gamybos darbuotojai, inžinieriai (ne IT), buhalteriai ir pan.\n"
    "3. Jei skelbimo miestas neatitinka kandidato pageidavimų ir nėra nuotolinis/hibridinis — ATMESTI.\n"
    "4. Jei nurodytas atlyginimas mažesnis nei kandidato minimumas — ATMESTI.\n"
    "5. Vertink 1-10 balų skalėje: pavadinimo atitikimas (50%), įgūdžių sutapimas (30%), vieta + darbo būdas (20%).\n\n"
    "Grąžink TIK atitinkančius skelbimus JSON masyvu:\n"
    '[{{"job_id": "123", "score": 8, "reason": "Frontend developer, React, Vilnius, hybrid"}}]\n\n'
    "Jei NIEKO neatitinka, grąžink: []\n\n"
    "NIEKADA neįtraukk ne-IT darbų. Geriau praleisti gerą skelbimą nei įtraukti blogą."
)

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("gaukdarba.title_matcher")


# ── Data loading ──────────────────────────────────────────────────────────────

def load_active_users(supabase) -> list[dict]:
    """
    Return profiles with plan_status='active' that have an active job_preferences row.
    Each entry has the shape:
      {"id": "...", "email": "...", "preferences": {...}}
    """
    prefs_res = (
        supabase.table("job_preferences")
        .select("user_id, desired_position, skills, preferred_cities, "
                "preferred_salary_min, experience_level, languages, keywords")
        .eq("is_active", True)
        .execute()
    )
    prefs_by_user: dict[str, dict] = {
        r["user_id"]: r for r in (prefs_res.data or [])
    }

    if not prefs_by_user:
        return []

    active_ids = list(prefs_by_user.keys())

    profiles_res = (
        supabase.table("profiles")
        .select("id, email")
        .eq("plan_status", "active")
        .in_("id", active_ids)
        .execute()
    )

    users = []
    for profile in (profiles_res.data or []):
        uid = profile["id"]
        if uid in prefs_by_user:
            users.append({**profile, "preferences": prefs_by_user[uid]})

    log.info("Loaded %d active users with active preferences", len(users))
    return users


def load_existing_match_ids(supabase, user_id: str) -> set[str]:
    """Return job_ids already in `matches` for this user today."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    res = (
        supabase.table("matches")
        .select("job_id")
        .eq("user_id", user_id)
        .gte("matched_at", f"{today}T00:00:00+00:00")
        .execute()
    )
    return {r["job_id"] for r in (res.data or [])}


# ── Layer 1: SQL pre-filter ──────────────────────────────────────────────────

def _build_location_patterns(preferred_cities: list[str]) -> list[str]:
    """Build ilike patterns for Supabase .or_() filter from user's city preferences."""
    patterns = []
    for city in preferred_cities:
        city_key = city.strip()
        if city_key in CITY_LOCATIVE_MAP:
            for form in CITY_LOCATIVE_MAP[city_key]:
                patterns.append(f"location.ilike.%{form}%")
        else:
            # Fallback: use the city name as-is
            patterns.append(f"location.ilike.%{city_key.lower()}%")

    # Always include remote/hybrid listings
    for kw in REMOTE_KEYWORDS:
        patterns.append(f"location.ilike.%{kw}%")

    return patterns


def _parse_salary_min(salary_raw: str) -> int | None:
    """
    Extract the minimum salary number from salary_raw strings like:
      "1500-2300 €/mėn. Neatskaičius mokesčių"
      "Nuo 2000 €/mėn. į rankas"
      "1800 €/mėn."
    Returns the first number found, or None if unparseable.
    """
    if not salary_raw:
        return None
    numbers = re.findall(r"(\d[\d\s]*\d|\d+)", salary_raw.replace(" ", ""))
    if numbers:
        try:
            return int(numbers[0].replace(" ", ""))
        except ValueError:
            return None
    return None


def sql_prefilter(supabase, user_prefs: dict) -> list[dict]:
    """
    Layer 1: Load today's listings filtered by city/location at the SQL level.
    Returns listings that match the user's city preferences OR are remote/hybrid.
    Also excludes listings with salary clearly below user's minimum.
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    preferred_cities = user_prefs.get("preferred_cities") or []

    all_listings: list[dict] = []
    page_size = 1000
    offset = 0

    # Build location filter
    location_patterns = []
    if preferred_cities:
        location_patterns = _build_location_patterns(preferred_cities)

    while True:
        query = (
            supabase.table("raw_listings")
            .select("job_id, title, company, salary_raw, location")
            .gte("scraped_at", f"{today}T00:00:00+00:00")
            .lt("scraped_at", f"{today}T23:59:59+00:00")
        )

        # Apply location filter if user has city preferences
        if location_patterns:
            query = query.or_(",".join(location_patterns))

        query = query.range(offset, offset + page_size - 1)
        res = query.execute()

        batch = res.data or []
        all_listings.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    # Post-filter salary in Python (SQL can't easily parse salary_raw text)
    salary_min = user_prefs.get("preferred_salary_min")
    if salary_min:
        filtered = []
        for listing in all_listings:
            parsed = _parse_salary_min(listing.get("salary_raw"))
            if parsed is not None and parsed < salary_min:
                continue  # Salary clearly too low — skip
            filtered.append(listing)  # NULL/unparseable salary → keep
        all_listings = filtered

    return all_listings


# ── Layer 2: Deterministic keyword filter ─────────────────────────────────────

def _find_role_keywords(desired_position: str) -> set[str] | None:
    """
    Look up the keyword set for the user's desired_position.
    Matches against ROLE_KEYWORD_MAP keys using substring matching.
    Returns None if no match found (will skip Layer 2 filtering).
    """
    if not desired_position:
        return None

    pos_lower = desired_position.lower()

    # Direct match
    if pos_lower in ROLE_KEYWORD_MAP:
        return ROLE_KEYWORD_MAP[pos_lower]

    # Substring match: "junior frontend developer" matches "frontend developer"
    for role_key, keywords in ROLE_KEYWORD_MAP.items():
        if role_key in pos_lower or pos_lower in role_key:
            return keywords

    # Partial word overlap: "react developer" → match "frontend developer" via shared keywords
    pos_words = set(pos_lower.split())
    best_match = None
    best_overlap = 0
    for role_key, keywords in ROLE_KEYWORD_MAP.items():
        role_words = set(role_key.split())
        overlap = len(pos_words & role_words)
        if overlap > best_overlap:
            best_overlap = overlap
            best_match = keywords

    if best_match and best_overlap > 0:
        return best_match

    return None


def deterministic_filter(listings: list[dict], user_prefs: dict) -> list[dict]:
    """
    Layer 2: Filter listings by title keywords.
    Returns only listings whose titles contain at least one whitelist keyword
    AND do not contain blacklisted words.
    """
    desired_position = user_prefs.get("desired_position") or ""
    role_keywords = _find_role_keywords(desired_position)

    # Also extract keywords from user's skills field
    skills = user_prefs.get("skills") or ""
    skill_keywords = set()
    if skills:
        for skill in re.split(r"[,;/\s]+", skills.lower()):
            skill = skill.strip()
            if len(skill) >= 3:  # skip tiny fragments
                skill_keywords.add(skill)

    # If we couldn't find any keywords, skip this layer (pass everything through)
    if not role_keywords and not skill_keywords:
        log.warning("  Layer 2: no keyword map for '%s' — passing all listings through", desired_position)
        return listings

    # Combine role keywords + skill keywords
    whitelist = (role_keywords or set()) | skill_keywords

    kept = []
    for listing in listings:
        title = (listing.get("title") or "").lower()

        # Check blacklist first — reject if any blacklisted stem found
        blacklisted = False
        for stem in TITLE_BLACKLIST:
            if stem in title:
                blacklisted = True
                break
        if blacklisted:
            continue

        # Check whitelist — keep if any keyword matches
        matched = False
        for keyword in whitelist:
            if keyword in title:
                matched = True
                break
        if matched:
            kept.append(listing)

    return kept


# ── Prompt building ───────────────────────────────────────────────────────────

def _format_system_prompt(preferences: dict) -> str:
    """Fill in the system prompt template with user preferences."""
    p = preferences
    cities = p.get("preferred_cities") or []
    langs = p.get("languages") or []

    return SYSTEM_PROMPT.format(
        desired_position=p.get("desired_position") or "Nenurodyta",
        skills=p.get("skills") or "Nenurodyti",
        preferred_cities=", ".join(cities) if isinstance(cities, list) else cities,
        preferred_salary_min=p.get("preferred_salary_min") or "Nenurodytas",
        experience_level=p.get("experience_level") or "Nenurodytas",
        languages=", ".join(langs) if isinstance(langs, list) else langs,
        keywords=p.get("keywords") or "Nenurodyta",
    )


def build_user_prompt(listings_batch: list[dict]) -> str:
    """Compose the user message: JSON job list."""
    jobs_json = json.dumps(
        [
            {
                "job_id":     j["job_id"],
                "title":      j.get("title") or "",
                "company":    j.get("company") or "",
                "location":   j.get("location") or "",
                "salary_raw": j.get("salary_raw") or "",
            }
            for j in listings_batch
        ],
        ensure_ascii=False,
    )

    return f"## Darbo skelbimai ({len(listings_batch)} vnt.)\n{jobs_json}"


# ── OpenAI call ───────────────────────────────────────────────────────────────

def _parse_response(raw: str) -> list[dict]:
    """
    Parse OpenAI response into a list of {job_id, score, reason}.
    Handles: plain JSON array, JSON wrapped in markdown fences,
    or dict envelope like {"matches": [...]}.
    """
    raw = raw.strip()

    # Strip markdown code fences
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```\s*$", "", raw.strip())
    raw = raw.strip()

    parsed = json.loads(raw)

    if isinstance(parsed, list):
        return parsed

    # Unwrap common envelope keys
    for key in ("matches", "results", "jobs", "data", "listings"):
        if key in parsed and isinstance(parsed[key], list):
            return parsed[key]

    # Last resort: first list value found
    for v in parsed.values():
        if isinstance(v, list):
            return v

    log.warning("Unexpected JSON shape from model: %s", raw[:300])
    return []


def call_openai(client: OpenAI, system_prompt: str, user_prompt: str) -> list[dict]:
    """
    Send one batch to GPT-4o-mini.
    Returns a list of {job_id, score, reason} dicts; empty list on failure.
    """
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            temperature=0.2,
        )
        raw = response.choices[0].message.content or ""
        return _parse_response(raw)

    except json.JSONDecodeError as exc:
        log.error("JSON parse error from model response: %s", exc)
    except Exception as exc:
        log.error("OpenAI API error: %s", exc)

    return []


# ── Per-user matching ─────────────────────────────────────────────────────────

def match_user(
    openai_client: OpenAI,
    supabase,
    user: dict,
) -> list[str]:
    """
    Run 3-layer funnel matching for one user.
    Inserts qualifying matches into the DB.
    Returns list of job_ids that scored >= MIN_SCORE (for Phase 2).
    """
    user_id     = user["id"]
    preferences = user["preferences"]
    existing    = load_existing_match_ids(supabase, user_id)
    now_utc     = datetime.now(timezone.utc).isoformat()

    # ── Layer 1: SQL pre-filter ───────────────────────────────────────────
    layer1_listings = sql_prefilter(supabase, preferences)
    layer1_count = len(layer1_listings)

    # Remove already-matched listings
    candidates = [l for l in layer1_listings if l["job_id"] not in existing]

    if not candidates:
        log.info("  [%s] Layer 1 (SQL): %d listings → all already matched, skipping",
                 user_id[:8], layer1_count)
        return []

    # ── Layer 2: Deterministic keyword filter ─────────────────────────────
    layer2_listings = deterministic_filter(candidates, preferences)
    layer2_count = len(layer2_listings)

    log.info("  [%s] Layer 1 (SQL): %d → %d | Layer 2 (keywords): %d → %d",
             user_id[:8], layer1_count, len(candidates), len(candidates), layer2_count)

    if not layer2_listings:
        log.info("  [%s] No listings survived Layer 2 — skipping LLM", user_id[:8])
        return []

    # ── Layer 3: LLM scoring ─────────────────────────────────────────────
    system_prompt = _format_system_prompt(preferences)
    n_batches = -(-len(layer2_listings) // BATCH_SIZE)  # ceil division

    log.info("  [%s] Layer 3 (LLM): sending %d listings in %d batch(es) to %s",
             user_id[:8], layer2_count, n_batches, MODEL)

    to_insert:    list[dict] = []
    qualified_ids: list[str] = []

    for batch_idx, offset in enumerate(range(0, len(layer2_listings), BATCH_SIZE), 1):
        batch  = layer2_listings[offset : offset + BATCH_SIZE]
        prompt = build_user_prompt(batch)

        log.info("    batch %d/%d — sending %d titles",
                 batch_idx, n_batches, len(batch))

        results = call_openai(openai_client, system_prompt, prompt)
        time.sleep(INTER_CALL_DELAY)

        log.info("    batch %d/%d — model returned %d items", batch_idx, n_batches, len(results))

        for item in results:
            job_id = str(item.get("job_id", "")).strip()
            score  = item.get("score")
            reason = str(item.get("reason") or "").strip()

            if not job_id:
                continue
            if not isinstance(score, (int, float)):
                continue
            score = int(score)
            if score < MIN_SCORE:
                continue
            if job_id in existing:
                continue

            existing.add(job_id)
            qualified_ids.append(job_id)
            to_insert.append({
                "user_id":     user_id,
                "job_id":      job_id,
                "title_score": score,
                "detail_score": None,
                "reason":      reason or None,
                "matched_at":  now_utc,
                "notified":    False,
            })

    # Bulk-insert all qualifying matches for this user
    if to_insert:
        supabase.table("matches").insert(to_insert).execute()

    log.info("  [%s] Layer 3 (LLM): %d → %d matches (score >= %d)",
             user_id[:8], layer2_count, len(qualified_ids), MIN_SCORE)

    return qualified_ids


# ── Entrypoint ────────────────────────────────────────────────────────────────

def run() -> dict[str, list[str]]:
    """
    Orchestrate title matching for all active users.

    Returns:
      {user_id: [job_ids_to_deep_scrape]}
      (pass this to the detail scraper / detail_matcher)
    """
    log.info("=" * 55)
    log.info(
        "GaukDarba title_matcher (3-layer funnel) — %s",
        datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    )
    log.info("=" * 55)

    supabase       = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    openai_client  = OpenAI(api_key=OPENAI_API_KEY)

    users = load_active_users(supabase)

    if not users:
        log.info("No active users — nothing to do.")
        return {}

    result: dict[str, list[str]] = {}

    for idx, user in enumerate(users, 1):
        log.info("User %d/%d  [%s]  %s", idx, len(users), user["id"][:8], user.get("email", ""))
        try:
            job_ids = match_user(openai_client, supabase, user)
            if job_ids:
                result[user["id"]] = job_ids
        except Exception as exc:
            log.error("Unhandled error for user [%s]: %s", user["id"][:8], exc)

    log.info("=" * 55)
    log.info("Title matching complete.")
    log.info("  Users processed      : %d", len(users))
    log.info("  Users with matches   : %d", len(result))
    log.info("  Total IDs for Phase 2: %d", sum(len(v) for v in result.values()))
    log.info("=" * 55)

    return result


if __name__ == "__main__":
    output = run()
    summary = {uid[:8]: len(ids) for uid, ids in output.items()}
    print(json.dumps(summary, indent=2))

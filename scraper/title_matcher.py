#!/usr/bin/env python3
"""
GaukDarba — Title matcher  (Phase 1 of 2-phase matching pipeline)

Flow:
  1. Load all active users that have active job_preferences
  2. Load all raw_listings scraped today
  3. For each user, send preferences + batches of 200 titles to GPT-4o-mini
  4. Keep matches with score >= 5
  5. Insert into `matches` table  (skip user+job_id pairs already matched today)
  6. Return {user_id: [job_ids]} for the detail scraper (Phase 2)

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
BATCH_SIZE        = 200    # job titles per OpenAI call
MIN_SCORE         = 5      # minimum title_score to keep a match
INTER_CALL_DELAY  = 0.5    # seconds between OpenAI calls (rate-limit courtesy)

SYSTEM_PROMPT = (
    "You are a job matching assistant for the Lithuanian job market. "
    "Given a job seeker's profile and a list of job titles with IDs, "
    "return the top 100 most relevant job IDs as a JSON array. "
    "Consider: title relevance to desired position, location match, "
    "salary range if visible, experience level fit. "
    'Return ONLY valid JSON: [{"job_id": "123", "score": 8, '
    '"reason": "Junior Python pozicija Vilniuje, atitinka patirtį"}]. '
    "Score 1-10."
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
      {"id": "...", "email": "...", "job_preferences": [{...}]}
    """
    # Two-step: first get user_ids that have active preferences
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


def load_todays_listings(supabase) -> list[dict]:
    """Return all raw_listings where scraped_at falls on today (UTC)."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    res = (
        supabase.table("raw_listings")
        .select("job_id, title, company, salary_raw, location")
        .gte("scraped_at", f"{today}T00:00:00+00:00")
        .lt( "scraped_at", f"{today}T23:59:59+00:00")
        .execute()
    )
    listings = res.data or []
    log.info("Loaded %d listings scraped today (%s)", len(listings), today)
    return listings


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


# ── Prompt building ───────────────────────────────────────────────────────────

def build_user_prompt(preferences: dict, listings_batch: list[dict]) -> str:
    """Compose the user message: candidate profile + JSON job list."""
    p = preferences

    lines = []
    if p.get("desired_position"):
        lines.append(f"Desired position: {p['desired_position']}")
    if p.get("skills"):
        lines.append(f"Skills: {p['skills']}")
    if p.get("preferred_cities"):
        cities = p["preferred_cities"]
        lines.append(f"Preferred cities: {', '.join(cities) if isinstance(cities, list) else cities}")
    if p.get("preferred_salary_min"):
        lines.append(f"Minimum salary: {p['preferred_salary_min']} EUR gross")
    if p.get("experience_level"):
        lines.append(f"Experience level: {p['experience_level']}")
    if p.get("languages"):
        langs = p["languages"]
        lines.append(f"Languages: {', '.join(langs) if isinstance(langs, list) else langs}")
    if p.get("keywords"):
        lines.append(f"Extra keywords: {p['keywords']}")

    profile_block = "\n".join(lines) if lines else "No specific preferences."

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

    return (
        f"## Candidate profile\n{profile_block}\n\n"
        f"## Job listings ({len(listings_batch)} items)\n{jobs_json}"
    )


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


def call_openai(client: OpenAI, user_prompt: str) -> list[dict]:
    """
    Send one batch to GPT-4o-mini.
    Returns a list of {job_id, score, reason} dicts; empty list on failure.
    """
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
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
    listings: list[dict],
) -> list[str]:
    """
    Run title matching for one user against all of today's listings.
    Inserts qualifying matches into the DB.
    Returns list of job_ids that scored >= MIN_SCORE (for Phase 2).
    """
    user_id     = user["id"]
    preferences = user["preferences"]
    existing    = load_existing_match_ids(supabase, user_id)
    now_utc     = datetime.now(timezone.utc).isoformat()

    # Only evaluate listings not yet matched today for this user
    candidates = [l for l in listings if l["job_id"] not in existing]

    if not candidates:
        log.info("  [%s] — all listings already matched today, skipping", user_id[:8])
        return []

    n_batches = -(-len(candidates) // BATCH_SIZE)  # ceil division
    log.info(
        "  [%s] — %d candidates across %d batch(es)",
        user_id[:8], len(candidates), n_batches,
    )

    to_insert:    list[dict] = []
    qualified_ids: list[str] = []

    for batch_idx, offset in enumerate(range(0, len(candidates), BATCH_SIZE), 1):
        batch  = candidates[offset : offset + BATCH_SIZE]
        prompt = build_user_prompt(preferences, batch)

        log.info(
            "    batch %d/%d — sending %d titles to %s",
            batch_idx, n_batches, len(batch), MODEL,
        )

        results = call_openai(openai_client, prompt)
        time.sleep(INTER_CALL_DELAY)

        log.info("    batch %d/%d — model returned %d items", batch_idx, n_batches, len(results))

        for item in results:
            job_id = str(item.get("job_id", "")).strip()
            score  = item.get("score")
            reason = str(item.get("reason") or "").strip()

            # Validate
            if not job_id:
                continue
            if not isinstance(score, (int, float)):
                continue
            score = int(score)
            if score < MIN_SCORE:
                continue
            if job_id in existing:          # skip already-matched (cross-batch dedup)
                continue

            existing.add(job_id)            # mark so later batches don't duplicate
            qualified_ids.append(job_id)
            to_insert.append({
                "user_id":     user_id,
                "job_id":      job_id,
                "title_score": score,
                "detail_score": None,       # filled by detail_matcher (Phase 2)
                "reason":      reason or None,
                "matched_at":  now_utc,
                "notified":    False,
            })

    # Bulk-insert all qualifying matches for this user
    if to_insert:
        supabase.table("matches").insert(to_insert).execute()
        log.info(
            "  [%s] — inserted %d match(es) with score >= %d",
            user_id[:8], len(to_insert), MIN_SCORE,
        )
    else:
        log.info("  [%s] — no qualifying matches this run", user_id[:8])

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
        "GaukDarba title_matcher — %s",
        datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    )
    log.info("=" * 55)

    supabase       = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    openai_client  = OpenAI(api_key=OPENAI_API_KEY)

    users    = load_active_users(supabase)
    listings = load_todays_listings(supabase)

    if not users:
        log.info("No active users — nothing to do.")
        return {}

    if not listings:
        log.info("No listings scraped today — nothing to match.")
        return {}

    result: dict[str, list[str]] = {}

    for idx, user in enumerate(users, 1):
        log.info("User %d/%d  [%s]  %s", idx, len(users), user["id"][:8], user.get("email", ""))
        try:
            job_ids = match_user(openai_client, supabase, user, listings)
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
    # Print a compact summary: {user_id_short: match_count}
    summary = {uid[:8]: len(ids) for uid, ids in output.items()}
    print(json.dumps(summary, indent=2))

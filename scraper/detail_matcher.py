#!/usr/bin/env python3
"""
GaukDarba — Detail matcher + email notifier  (Phase 2b of pipeline)

For each active user:
  1. Load today's title-matched jobs (title_score >= 5, detail_score IS NULL)
     that now have a listing_details entry
  2. Send preferences + full descriptions in batches of 20 to GPT-4o-mini
  3. Write detail_score + updated reason back to `matches`
  4. For matches with detail_score >= 7, send a digest email via Resend

Required env vars:
  OPENAI_API_KEY       — OpenAI secret key
  RESEND_API_KEY       — Resend secret key
  SUPABASE_URL         — https://xxx.supabase.co
  SUPABASE_SERVICE_KEY — service-role key (bypasses RLS)

Optional env vars:
  RESEND_FROM_EMAIL    — "GaukDarba <noreply@yourdomain.lt>"  (default shown)
  APP_URL              — dashboard base URL for email links
"""

import json
import logging
import os
import re
import time
from datetime import datetime, timezone

from openai import OpenAI
import resend
from supabase import create_client

# ── Config ────────────────────────────────────────────────────────────────────

OPENAI_API_KEY       = os.environ["OPENAI_API_KEY"]
RESEND_API_KEY       = os.environ["RESEND_API_KEY"]
SUPABASE_URL         = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

RESEND_FROM    = os.environ.get("RESEND_FROM_EMAIL", "GaukDarba <noreply@gaukdarba.lt>")
APP_URL        = os.environ.get("APP_URL", "https://gaukdarba.lt")

MODEL             = "gpt-4o-mini"
BATCH_SIZE        = 20      # job descriptions per OpenAI call
MIN_TITLE_SCORE   = 5       # minimum title_score to consider for deep matching
MIN_DETAIL_SCORE  = 7       # minimum detail_score to include in email
INTER_CALL_DELAY  = 0.5     # seconds between OpenAI calls
DESC_TRUNCATE     = 2500    # chars — keeps token cost predictable per job

SYSTEM_PROMPT = (
    "Tu esi darbo skelbimų atitikimo vertintojas. Gauni kandidato profilį ir detalius darbo aprašymus.\n"
    "Įvertink kiekvieną darbą 1-10 balu pagal gilų atitikimą.\n"
    "Atsižvelk į: reikalaujamus įgūdžius vs kandidato įgūdžius, patirties lygį, atlyginimo atitikimą, "
    "kalbų reikalavimus, darbo aprašymo toną ir kultūrą.\n\n"
    "Kiekvienam skelbimui pateik:\n"
    '1. "score" — balas 1-10\n'
    '2. "reason" — 2-3 sakinių aprašymas, kuriame nurodyk:\n'
    "   - Kokias KONKREČIAS technologijas/įgūdžius reikalauja (ne tik \"React įgūdžių\")\n"
    "   - Ar atlyginimas atitinka ir koks jis (pvz. \"2880-4320€, virš 1200€ minimumo\")\n"
    "   - Ar darbo būdas (hybrid/remote/office) atitinka\n"
    "   - Kas yra pagrindinė priežastis kodėl tinka arba netinka\n\n"
    "Pavyzdys gero reason:\n"
    '"React frontend pozicija Registrų Centre, Vilniuje. Reikalauja React, TypeScript, REST API patirties. '
    'Atlyginimas 2880-4320€ neatskaičius mokesčių (virš 1200€ minimumo). Hibridinis darbas."\n\n'
    "Pavyzdys blogo reason (NEVARTOTI):\n"
    '"Reikalauja React įgūdžių, kurie atitinka vartotojo profilius."\n\n'
    'Atsakymo formatas — TIK JSON masyvas:\n'
    '[{"job_id": "123", "score": 9, "reason": "..."}]\n\n'
    "Jei nieko neatitinka: []"
)

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("gaukdarba.detail_matcher")


# ── Data loading ──────────────────────────────────────────────────────────────

def load_active_users(supabase) -> list[dict]:
    prefs_res = (
        supabase.table("job_preferences")
        .select("user_id, desired_position, skills, preferred_cities, "
                "preferred_salary_min, experience_level, languages, keywords")
        .eq("is_active", True)
        .execute()
    )
    prefs_by_user = {r["user_id"]: r for r in (prefs_res.data or [])}
    if not prefs_by_user:
        return []

    profiles_res = (
        supabase.table("profiles")
        .select("id, email")
        .eq("plan_status", "active")
        .in_("id", list(prefs_by_user.keys()))
        .execute()
    )
    users = []
    for p in (profiles_res.data or []):
        uid = p["id"]
        if uid in prefs_by_user:
            users.append({**p, "preferences": prefs_by_user[uid]})

    log.info("Loaded %d active users", len(users))
    return users


def load_pending_matches(supabase, user_id: str) -> list[dict]:
    """
    Return today's matches for a user that:
    - title_score >= MIN_TITLE_SCORE
    - detail_score IS NULL (not yet deep-matched)
    - have a listing_details entry  (detail page already scraped)
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    matches_res = (
        supabase.table("matches")
        .select("id, job_id, title_score")
        .eq("user_id", user_id)
        .gte("title_score", MIN_TITLE_SCORE)
        .is_("detail_score", "null")
        .gte("matched_at", f"{today}T00:00:00+00:00")
        .execute()
    )
    matches = matches_res.data or []
    if not matches:
        return []

    job_ids = [m["job_id"] for m in matches]

    # Fetch listing_details for these job_ids
    details_res = (
        supabase.table("listing_details")
        .select("job_id, description, full_salary, requirements")
        .in_("job_id", job_ids)
        .execute()
    )
    details_by_job = {r["job_id"]: r for r in (details_res.data or [])}

    # Fetch raw_listings for title/company/salary/url
    listings_res = (
        supabase.table("raw_listings")
        .select("job_id, title, company, salary_raw, location, url")
        .in_("job_id", job_ids)
        .execute()
    )
    listings_by_job = {r["job_id"]: r for r in (listings_res.data or [])}

    # Only return matches that have detail data (detail scraper may not have run for all)
    enriched = []
    for m in matches:
        jid = m["job_id"]
        if jid not in details_by_job:
            continue
        enriched.append({
            **m,
            "details": details_by_job[jid],
            "listing": listings_by_job.get(jid, {}),
        })

    log.info(
        "  [%s] %d/%d matches have listing_details",
        user_id[:8], len(enriched), len(matches),
    )
    return enriched


# ── Prompt building ───────────────────────────────────────────────────────────

def build_profile_block(prefs: dict) -> str:
    lines = []
    if prefs.get("desired_position"):
        lines.append(f"Desired position: {prefs['desired_position']}")
    if prefs.get("skills"):
        lines.append(f"Skills: {prefs['skills']}")
    if prefs.get("preferred_cities"):
        c = prefs["preferred_cities"]
        lines.append(f"Preferred cities: {', '.join(c) if isinstance(c, list) else c}")
    if prefs.get("preferred_salary_min"):
        lines.append(f"Minimum salary: {prefs['preferred_salary_min']} EUR gross")
    if prefs.get("experience_level"):
        lines.append(f"Experience level: {prefs['experience_level']}")
    if prefs.get("languages"):
        l = prefs["languages"]
        lines.append(f"Languages: {', '.join(l) if isinstance(l, list) else l}")
    if prefs.get("keywords"):
        lines.append(f"Extra keywords: {prefs['keywords']}")
    return "\n".join(lines) if lines else "No specific preferences."


def build_detail_prompt(prefs: dict, batch: list[dict]) -> str:
    jobs_payload = []
    for m in batch:
        detail  = m["details"]
        listing = m["listing"]
        desc    = (detail.get("description") or "").strip()
        reqs    = (detail.get("requirements") or "").strip()
        jobs_payload.append({
            "job_id":      m["job_id"],
            "title":       listing.get("title") or "",
            "company":     listing.get("company") or "",
            "location":    listing.get("location") or "",
            "salary":      detail.get("full_salary") or listing.get("salary_raw") or "",
            "description": desc[:DESC_TRUNCATE],
            "requirements": reqs[:1000] if reqs else "",
        })

    return (
        f"## Candidate profile\n{build_profile_block(prefs)}\n\n"
        f"## Job details ({len(batch)} jobs)\n"
        + json.dumps(jobs_payload, ensure_ascii=False)
    )


# ── OpenAI call ───────────────────────────────────────────────────────────────

def _parse_llm_response(raw: str) -> list[dict]:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```\s*$", "", raw.strip()).strip()
    parsed = json.loads(raw)
    if isinstance(parsed, list):
        return parsed
    for key in ("matches", "results", "jobs", "data"):
        if key in parsed and isinstance(parsed[key], list):
            return parsed[key]
    for v in parsed.values():
        if isinstance(v, list):
            return v
    log.warning("Unexpected JSON shape: %s", raw[:300])
    return []


def call_openai(client: OpenAI, prompt: str) -> list[dict]:
    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": prompt},
            ],
            temperature=0.2,
        )
        raw = resp.choices[0].message.content or ""
        return _parse_llm_response(raw)
    except json.JSONDecodeError as exc:
        log.error("JSON parse error: %s", exc)
    except Exception as exc:
        log.error("OpenAI API error: %s", exc)
    return []


# ── Email ─────────────────────────────────────────────────────────────────────

def _score_badge(score: int) -> str:
    if score >= 9:
        bg, fg = "#dcfce7", "#166534"
    elif score >= 7:
        bg, fg = "#dbeafe", "#1e40af"
    else:
        bg, fg = "#fef9c3", "#854d0e"
    return (
        f'<span style="display:inline-block;background:{bg};color:{fg};'
        f'padding:3px 10px;border-radius:20px;font-weight:700;font-size:13px;">'
        f"{score}/10</span>"
    )


def _match_card(m: dict) -> str:
    listing = m["listing"]
    title   = listing.get("title") or "Nežinoma pozicija"
    company = listing.get("company") or ""
    salary  = m["details"].get("full_salary") or listing.get("salary_raw") or ""
    loc     = listing.get("location") or ""
    url     = listing.get("url") or "#"
    score   = m["detail_score"]
    reason  = m.get("reason") or ""
    meta    = " · ".join(p for p in [loc, salary] if p)

    return f"""
    <tr>
      <td style="padding:0 0 16px;">
        <table width="100%" cellpadding="0" cellspacing="0"
               style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="padding:18px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:top;">
                    <a href="{url}" style="color:#4338ca;text-decoration:none;
                       font-size:16px;font-weight:600;line-height:1.3;">{title}</a>
                    <p style="margin:4px 0 0;color:#374151;font-size:14px;">{company}</p>
                  </td>
                  <td align="right" style="vertical-align:top;padding-left:12px;white-space:nowrap;">
                    {_score_badge(score)}
                  </td>
                </tr>
                {"<tr><td colspan='2' style='padding-top:6px;'><p style='margin:0;color:#9ca3af;font-size:12px;'>"+meta+"</p></td></tr>" if meta else ""}
                <tr>
                  <td colspan="2" style="padding-top:10px;">
                    <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">{reason}</p>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:12px;">
                    <a href="{url}" style="color:#4338ca;font-size:13px;font-weight:500;">
                      Žiūrėti skelbimą →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>"""


def build_email(user_email: str, top_matches: list[dict], total_count: int) -> tuple[str, str]:
    """Return (subject, html_body)."""
    date_lt = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    subject = f"🎯 Nauji darbo pasiūlymai tau — {date_lt}"
    shown   = min(5, len(top_matches))
    cards   = "".join(_match_card(m) for m in top_matches[:5])

    html = f"""<!DOCTYPE html>
<html lang="lt">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0"
           style="background:#ffffff;border-radius:12px;overflow:hidden;
                  box-shadow:0 1px 4px rgba(0,0,0,.08);">

      <!-- Header -->
      <tr>
        <td style="background:#4338ca;padding:28px 40px;">
          <p style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:-.3px;">
            <span style="color:#a5b4fc;">Gauk</span>Darba
          </p>
          <p style="margin:6px 0 0;font-size:13px;color:#c7d2fe;">AI darbo paieška Lietuvoje</p>
        </td>
      </tr>

      <!-- Intro -->
      <tr>
        <td style="padding:28px 40px 20px;">
          <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">
            AI rado {total_count} darbo atitikimų
          </h2>
          <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.6;">
            Čia {shown} geriausiai atitinkantys pagal išsamų AI vertinimą ({date_lt}):
          </p>
        </td>
      </tr>

      <!-- Match cards -->
      <tr>
        <td style="padding:0 40px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            {cards}
          </table>
        </td>
      </tr>

      <!-- CTA -->
      <tr>
        <td style="padding:20px 40px 36px;text-align:center;">
          <a href="{APP_URL}/dashboard"
             style="display:inline-block;background:#4338ca;color:#ffffff;
                    padding:13px 32px;border-radius:8px;text-decoration:none;
                    font-weight:600;font-size:15px;">
            Peržiūrėti visus atitikimus
          </a>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding:20px 40px;border-top:1px solid #e5e7eb;
                   background:#f9fafb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            GaukDarba · Šis laiškas išsiųstas į {user_email}
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body></html>"""

    return subject, html


def send_email(user_email: str, subject: str, html: str) -> bool:
    try:
        resend.api_key = RESEND_API_KEY
        resp = resend.Emails.send({
            "from":    RESEND_FROM,
            "to":      [user_email],
            "subject": subject,
            "html":    html,
        })
        log.info("  Email sent to %s  (id=%s)", user_email, resp.get("id", "?"))
        return True
    except Exception as exc:
        log.error("  Failed to send email to %s: %s", user_email, exc)
        return False


# ── Per-user deep matching ────────────────────────────────────────────────────

def match_user(openai_client: OpenAI, supabase, user: dict) -> int:
    """
    Deep-match one user's pending title-matched jobs.
    Returns count of matches updated with a detail_score.
    """
    user_id = user["id"]
    prefs   = user["preferences"]
    pending = load_pending_matches(supabase, user_id)

    if not pending:
        return 0

    n_batches = -(-len(pending) // BATCH_SIZE)
    log.info(
        "  [%s] %d jobs → %d batch(es) of %d",
        user_id[:8], len(pending), n_batches, BATCH_SIZE,
    )

    scored: list[dict] = []   # matches with detail_score filled in

    for b_idx, offset in enumerate(range(0, len(pending), BATCH_SIZE), 1):
        batch  = pending[offset : offset + BATCH_SIZE]
        prompt = build_detail_prompt(prefs, batch)

        log.info("    batch %d/%d — %d descriptions → %s", b_idx, n_batches, len(batch), MODEL)
        results = call_openai(openai_client, prompt)
        time.sleep(INTER_CALL_DELAY)
        log.info("    batch %d/%d — model returned %d scores", b_idx, n_batches, len(results))

        # Index batch items by job_id for fast lookup
        batch_by_job = {m["job_id"]: m for m in batch}

        for item in results:
            job_id = str(item.get("job_id", "")).strip()
            score  = item.get("score")
            reason = str(item.get("reason") or "").strip()

            if not job_id or not isinstance(score, (int, float)):
                continue
            score = int(score)

            match = batch_by_job.get(job_id)
            if not match:
                log.warning("    model returned unknown job_id=%s — ignoring", job_id)
                continue

            if score <= 2:
                # Garbage match — delete entirely instead of keeping
                supabase.table("matches").delete().eq("id", match["id"]).execute()
                log.info("    deleted garbage match job_id=%s (score=%d)", job_id, score)
                continue

            # Persist detail_score + updated reason
            supabase.table("matches").update({
                "detail_score": score,
                "reason":       reason or None,
            }).eq("id", match["id"]).execute()

            scored.append({**match, "detail_score": score, "reason": reason})

    # ── Email high-scoring matches ─────────────────────────────────────────
    notifiable = [m for m in scored if m["detail_score"] >= MIN_DETAIL_SCORE]
    notifiable.sort(key=lambda m: m["detail_score"], reverse=True)

    if notifiable:
        subject, html = build_email(user["email"], notifiable, len(scored))
        sent = send_email(user["email"], subject, html)

        if sent:
            # Mark as notified
            ids = [m["id"] for m in notifiable]
            supabase.table("matches").update({"notified": True}).in_("id", ids).execute()

    log.info(
        "  [%s] scored=%d  notifiable=%d  email=%s",
        user_id[:8], len(scored), len(notifiable),
        "sent" if notifiable else "skipped",
    )
    return len(scored)


# ── Entrypoint ────────────────────────────────────────────────────────────────

def run() -> None:
    log.info("=" * 55)
    log.info(
        "GaukDarba detail_matcher — %s",
        datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    )
    log.info("=" * 55)

    supabase      = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    openai_client = OpenAI(api_key=OPENAI_API_KEY)

    users = load_active_users(supabase)
    if not users:
        log.info("No active users — nothing to do.")
        return

    total_scored = 0
    for idx, user in enumerate(users, 1):
        log.info("User %d/%d  [%s]  %s", idx, len(users), user["id"][:8], user.get("email", ""))
        try:
            total_scored += match_user(openai_client, supabase, user)
        except Exception as exc:
            log.error("Unhandled error for user [%s]: %s", user["id"][:8], exc)

    log.info("=" * 55)
    log.info("Detail matching complete.")
    log.info("  Users processed  : %d", len(users))
    log.info("  Total scored     : %d", total_scored)
    log.info("=" * 55)


if __name__ == "__main__":
    run()

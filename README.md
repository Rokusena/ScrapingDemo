# GaukDarba

AI-powered job matching platform for the Lithuanian job market. Scrapes 5 job portals daily, scores every listing against your profile using GPT-4o-mini, and sends a digest of the best matches to your inbox.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | Next.js 14 (App Router) + TypeScript | Web app |
| **Styling** | Tailwind CSS | UI |
| **Auth** | Supabase Auth (email magic link / OTP) | Passwordless login |
| **Database** | Supabase (PostgreSQL + RLS) | All app data |
| **Payments** | Stripe | Monthly subscriptions |
| **Email** | Resend | Job digest emails + magic links |
| **AI** | OpenAI GPT-4o-mini | Job matching + CV parsing |
| **Webapp hosting** | Vercel | Next.js deployment + cron |
| **Scraper hosting** | Railway | Python pipeline cron jobs |
| **Scraper runtime** | Python 3.12 + Docker | Scraping pipeline |
| **SPA scraping** | Playwright (Chromium) | Unicorns.lt JS rendering |

---

## Repository Structure

```
ScrapingDemo/
├── webapp/                      # Next.js app (deployed to Vercel)
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx             # Landing page
│   │   │   ├── onboarding/page.tsx  # 4-step signup wizard
│   │   │   ├── login/page.tsx       # Magic link login (returning users)
│   │   │   ├── dashboard/
│   │   │   │   ├── layout.tsx       # Sidebar layout
│   │   │   │   ├── page.tsx         # Job matches
│   │   │   │   └── preferences/     # Job search settings
│   │   │   ├── auth/callback/       # Supabase OTP callback
│   │   │   └── api/
│   │   │       ├── scrape/          # POST /api/scrape (Vercel cron)
│   │   │       ├── scan-now/        # On-demand scan trigger
│   │   │       ├── cv-extract/      # PDF CV → JSON via OpenAI
│   │   │       └── stripe/          # Checkout + webhook
│   │   ├── lib/supabase/            # Browser + server Supabase clients
│   │   ├── components/              # SignOutButton etc.
│   │   └── types/database.ts        # TypeScript types
│   ├── supabase/migrations/         # SQL migrations (run in order)
│   ├── vercel.json                  # Cron job config
│   └── package.json
│
└── scraper/                     # Python pipeline (deployed to Railway)
    ├── main.py                  # Pipeline orchestrator (4 stages)
    ├── scrape.py                # Stage 1a: CVBankas.lt scraper
    ├── scrape_cvonline.py       # Stage 1b: CV-Online.lt scraper
    ├── scrape_cvmarket.py       # Stage 1c: CVmarket.lt scraper
    ├── scrape_unicorns.py       # Stage 1d: Unicorns.lt scraper (Playwright)
    ├── scrape_uzt.py            # Stage 1e: UZT.lt scraper
    ├── title_matcher.py         # Stage 2: 3-layer title funnel + LLM
    ├── detail_scraper.py        # Stage 3: Fetch full job descriptions
    ├── detail_matcher.py        # Stage 4: Deep LLM scoring + email digest
    ├── api_server.py            # HTTP server for on-demand scan triggers
    ├── Dockerfile
    ├── railway.toml
    └── requirements.txt
```

---

## Database Schema (Supabase)

Run migrations in order from `webapp/supabase/migrations/`:

| File | What it creates |
|---|---|
| `001_initial.sql` | Core tables: `profiles`, `job_preferences`, `raw_listings`, `listing_details`, `matches` + RLS |
| `002_listing_details_unique.sql` | Unique constraint on `listing_details.job_id` |
| `003_scrape_metadata.sql` | `scrape_metadata` table (24h gate between scrapes) |
| `004_multi_source.sql` | `source` column on `raw_listings`, `work_format` on `job_preferences`, `scraper_runs` logging table |

### Key tables

- **`profiles`** — One row per user. Linked to `auth.users`. Stores `plan_status` (free / active / cancelled) and `stripe_customer_id`.
- **`job_preferences`** — User's search criteria (position, skills, cities, salary, experience level, work format).
- **`raw_listings`** — All scraped job listings. `job_id` is unique per source. `source` identifies which portal it came from.
- **`listing_details`** — Full descriptions fetched in Stage 3 for title-matched jobs.
- **`matches`** — AI-scored matches per user. Has both a `title_score` (fast, Stage 2) and `detail_score` (deep, Stage 4).
- **`scraper_runs`** — One row per scraper execution for observability.

---

## Environment Variables

### Webapp (`webapp/.env.local`)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=eyJ...

# Only on the server (never expose to client)
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...

# App
NEXT_PUBLIC_APP_URL=https://gaukdarba.lt

# Scraper trigger (for /api/scrape Vercel cron)
SCRAPE_SECRET=your-random-secret
PIPELINE_API_URL=https://your-railway-api-service.up.railway.app
API_SECRET=same-secret-as-railway
```

### Scraper (`Railway environment variables`)

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...   # service-role key, bypasses RLS

OPENAI_API_KEY=sk-...

RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=GaukDarba <noreply@gaukdarba.lt>

APP_URL=https://gaukdarba.lt

# Controls which pipeline stages this Railway service runs
# "scraper"  → Stage 1 only (scrape all portals)
# "matcher"  → Stages 2-4 (match + email)
# "full"     → All stages (manual / one-shot runs)
RUN_MODE=scraper

# For the api_server.py web service
API_SECRET=your-random-secret
API_PORT=8080
```

---

## Scraper Pipeline

The scraper is a 4-stage Python pipeline. Each stage is isolated — a failure in one stage does not abort the others.

```
Stage 1 — Scrape all 5 portals → raw_listings
Stage 2 — Title matcher (SQL + keywords + LLM) → matches (title_score)
Stage 3 — Fetch full descriptions for matched jobs → listing_details
Stage 4 — Deep LLM scoring + email digest → matches (detail_score)
```

### Stage 1 — Scrapers

| File | Source | Method |
|---|---|---|
| `scrape.py` | CVBankas.lt | HTTP + BeautifulSoup |
| `scrape_cvonline.py` | CV-Online.lt | HTTP + BeautifulSoup |
| `scrape_cvmarket.py` | CVmarket.lt | RSS (preferred) → HTML fallback |
| `scrape_unicorns.py` | Unicorns.lt | Playwright (Chromium headless) |
| `scrape_uzt.py` | UZT.lt | HTTP + BeautifulSoup (Drupal pagination) |

All scrapers output to the same schema (`raw_listings` table). Job IDs are prefixed per source to guarantee uniqueness: `cvonline_12345`, `cvmarket_67890`, etc.

### Stage 2 — Title Matcher (3-layer funnel)

Runs per user against today's listings:

1. **SQL layer** — Filter by user's city and minimum salary. Narrows ~3,000 listings to ~500.
2. **Keyword layer** — Deterministic whitelist/blacklist on job title text. Narrows ~500 to ~50-100.
3. **LLM layer** — GPT-4o-mini scores each surviving title 1-10 against the user's desired role. Keeps scores ≥ 5.

### Stage 3 — Detail Scraper

Fetches full job description pages from CVBankas for the title-matched jobs. Stores text in `listing_details`.

### Stage 4 — Detail Matcher

GPT-4o-mini re-scores each match using the full job description + user profile. Writes `detail_score` (1-10) and a `reason` explanation. Sends an email digest via Resend for matches scoring ≥ 7.

### Running a scraper manually

```bash
cd scraper
pip install -r requirements.txt

# Run a single scraper (requires env vars)
export SUPABASE_URL=...
export SUPABASE_SERVICE_KEY=...

python scrape.py            # CVBankas
python scrape_cvonline.py   # CV-Online
python scrape_cvmarket.py   # CVmarket
python scrape_unicorns.py   # Unicorns (needs: playwright install chromium)
python scrape_uzt.py        # UZT

# Run the full pipeline
export OPENAI_API_KEY=...
export RESEND_API_KEY=...
export RESEND_FROM_EMAIL="GaukDarba <noreply@gaukdarba.lt>"
export APP_URL=https://gaukdarba.lt
export RUN_MODE=full

python main.py
```

### Running only specific stages

```bash
RUN_MODE=scraper python main.py   # Stage 1 only (scrape portals)
RUN_MODE=matcher python main.py   # Stages 2-4 only (match + email)
RUN_MODE=full    python main.py   # All stages
```

---

## Deployment

### Vercel (Webapp)

1. Connect the `webapp/` directory to a Vercel project.
2. Set all webapp environment variables in Vercel → Settings → Environment Variables.
3. The `vercel.json` at `webapp/vercel.json` configures a daily cron that hits `POST /api/scrape` at 3am UTC (6am Lithuanian time).

```json
{
  "crons": [{ "path": "/api/scrape", "schedule": "0 3 * * *" }]
}
```

The `/api/scrape` endpoint is protected with the `x-scrape-secret` header matching `SCRAPE_SECRET`. Vercel sends this header automatically via the cron config when you set the secret as an environment variable. Alternatively, call it manually:

```bash
curl -X POST https://gaukdarba.lt/api/scrape \
  -H "x-scrape-secret: your-secret"
```

### Railway (Scraper)

Two separate Railway services share the same Docker image from `scraper/`. The `RUN_MODE` env var controls which stages each service runs.

#### Service 1 — Scraper (Stage 1)

| Setting | Value |
|---|---|
| Root directory | `scraper/` |
| Type | Cron Job |
| Schedule | `0 2 * * *` (2am UTC = 4am Lithuania time) |
| Start command | `python main.py` |
| `RUN_MODE` | `scraper` |

#### Service 2 — Matcher (Stages 2-4)

| Setting | Value |
|---|---|
| Root directory | `scraper/` |
| Type | Cron Job |
| Schedule | `0 * * * *` (every hour) |
| Start command | `python main.py` |
| `RUN_MODE` | `matcher` |

The matcher runs every hour but checks if it already ran today. If matches exist in the DB from today, it skips automatically.

#### Service 3 — API Server (on-demand scans)

| Setting | Value |
|---|---|
| Root directory | `scraper/` |
| Type | Web Service |
| Start command | `python api_server.py` |
| `API_PORT` | `8080` |
| `API_SECRET` | same value as webapp's `API_SECRET` |

This service handles on-demand scans triggered from the dashboard ("Ieškoti dabar" button). The webapp calls `PIPELINE_API_URL/scan-now` and polls `PIPELINE_API_URL/scan-status?scan_id=...`.

#### Playwright on Railway

The Unicorns.lt scraper uses Playwright. Add this to your `Dockerfile` (already present in `requirements.txt`):

```dockerfile
RUN pip install playwright && playwright install chromium --with-deps
```

Or add to Railway's build command. Without this, the Unicorns scraper will log a warning and skip gracefully — it does not crash the rest of the pipeline.

---

## Auth Flow

1. New users go through `/onboarding` — a 4-step wizard that collects name, email, job preferences, and work format.
2. Step 1 sends a Supabase magic link email. Clicking it exchanges the OTP code at `/auth/callback?next=/onboarding` and redirects back into the wizard.
3. After Step 4 the user is redirected to Stripe Checkout. After payment, Stripe sends a webhook to `/api/stripe/webhook` which sets `plan_status = 'active'` on their profile.
4. Returning users go to `/login` for a plain magic link login.
5. Sessions are persisted in cookies (Supabase SSR) and auto-refreshed. The browser client stores auth state under the key `gaukdarba-auth`.

---

## Stripe Setup

1. Create a product in Stripe with a recurring monthly price of €10.
2. Copy the Price ID (`price_...`) to `STRIPE_PRICE_ID`.
3. Add a webhook endpoint in Stripe pointing to `https://your-domain/api/stripe/webhook`.
4. Subscribe to these events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
5. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`.

---

## Resend Setup

1. Create an account at resend.com and verify your sending domain.
2. Create an API key and set it as `RESEND_API_KEY`.
3. Set `RESEND_FROM_EMAIL` to a verified sender address, e.g. `GaukDarba <noreply@gaukdarba.lt>`.
4. Supabase also uses Resend for magic link delivery — configure this in Supabase Dashboard → Authentication → SMTP settings using Resend's SMTP credentials.

---

## Supabase Setup

1. Create a new project at supabase.com.
2. Run the migrations in order in the SQL Editor:
   - `webapp/supabase/migrations/001_initial.sql`
   - `webapp/supabase/migrations/002_listing_details_unique.sql`
   - `webapp/supabase/migrations/003_scrape_metadata.sql`
   - `webapp/supabase/migrations/004_multi_source.sql`
3. In Authentication → URL Configuration, set:
   - **Site URL**: `https://your-domain.lt`
   - **Redirect URLs**: `https://your-domain.lt/auth/callback`
4. Copy the **Project URL** and **anon/public key** to the webapp env.
5. Copy the **service_role key** to both the webapp (`SUPABASE_SERVICE_ROLE_KEY`) and Railway (`SUPABASE_SERVICE_KEY`).

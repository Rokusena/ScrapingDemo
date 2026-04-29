# GaukDarba

AI-powered job matching platform for the Lithuanian job market. Scrapes 5 job portals daily, scores every listing against your profile using GPT-4o-mini, and sends a digest of the best matches to your inbox. Works for all job types — IT roles, warehouse workers, drivers, cleaners, accountants, and more.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | Next.js 14 (App Router) + TypeScript | Web app |
| **Styling** | Tailwind CSS + inline CSS vars | UI |
| **Auth** | Supabase Auth (email magic link + Google OAuth) | Passwordless login |
| **Database** | Supabase (PostgreSQL + RLS) | All app data |
| **Payments** | Stripe | Monthly subscriptions |
| **Email** | Resend | Job digest emails + magic links |
| **AI** | OpenAI GPT-4o-mini | Job matching + CV parsing |
| **Webapp hosting** | Vercel | Next.js deployment |
| **Scraper hosting** | GitHub Actions | Python pipeline cron jobs |
| **Scraper runtime** | Python 3.12 | Scraping pipeline |
| **SPA scraping** | Playwright (Chromium) | CVmarket.lt + Unicorns.lt |

---

## Repository Structure

```
ScrapingDemo/
├── webapp/                      # Next.js app (deployed to Vercel)
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx             # Landing page
│   │   │   ├── onboarding/page.tsx  # Multi-step signup wizard
│   │   │   ├── login/page.tsx       # Magic link + Google login
│   │   │   ├── dashboard/
│   │   │   │   ├── layout.tsx       # Dashboard layout
│   │   │   │   ├── page.tsx         # Job matches
│   │   │   │   └── preferences/     # Job search settings + CV upload
│   │   │   ├── auth/callback/       # Supabase OTP callback
│   │   │   └── api/
│   │   │       ├── scan-now/        # On-demand scan trigger
│   │   │       ├── cv-extract/      # PDF CV → structured JSON via OpenAI
│   │   │       └── stripe/          # Checkout + webhook
│   │   ├── lib/supabase/            # Browser + server Supabase clients
│   │   ├── components/              # SignOutButton etc.
│   │   └── types/database.ts        # TypeScript types
│   ├── supabase/migrations/         # SQL migrations (run in order)
│   └── package.json
│
├── scraper/                     # Python pipeline (runs via GitHub Actions)
│   ├── main.py                  # Pipeline orchestrator (RUN_MODE: scraper | matcher)
│   ├── scrape.py                # CVBankas.lt scraper
│   ├── scrape_cvonline.py       # CV-Online.lt scraper
│   ├── scrape_cvmarket.py       # CVmarket.lt scraper (Playwright)
│   ├── scrape_unicorns.py       # Unicorns.lt scraper (Playwright)
│   ├── scrape_uzt.py            # UZT.lt scraper
│   ├── title_matcher.py         # 3-layer title funnel (SQL + keywords + LLM)
│   ├── detail_scraper.py        # Fetch full job descriptions
│   ├── detail_matcher.py        # Deep LLM scoring + email digest
│   ├── api_server.py            # HTTP server for on-demand scan triggers
│   └── requirements.txt
│
└── .github/workflows/
    ├── scraper.yml              # Runs Stage 1 daily at 01:00 UTC (04:00 Vilnius)
    └── matcher.yml              # Runs Stages 2-4 every hour
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

- **`profiles`** — One row per user. Stores `plan_status` (free / active / cancelled) and `stripe_customer_id`.
- **`job_preferences`** — User's search criteria. `desired_position` must be one of the known role keys (see below).
- **`raw_listings`** — All scraped job listings. `job_id` is unique per source (`cvbankas_123`, `uzt_DV-456`, etc.).
- **`listing_details`** — Full descriptions fetched in Stage 3 for title-matched jobs.
- **`matches`** — AI-scored matches per user. Has `title_score` (Stage 2) and `detail_score` (Stage 4).
- **`scraper_runs`** — One row per scraper execution for observability.

---

## Supported Job Roles

`desired_position` must be one of these exact values. Used by the matcher's keyword layer — each role has a tailored keyword set and the IT blacklist is only applied for IT roles (non-IT roles never get filtered by IT-specific terms).

| Value | Description |
|---|---|
| `frontend developer` | React, Vue, Angular, Next.js |
| `backend developer` | Python, Java, Node.js, .NET |
| `fullstack developer` | Full-stack / Pilno spektro |
| `ai engineer` | AI, ML, LLM, NLP, machine learning |
| `data scientist` | Data analyst, BI analyst |
| `devops engineer` | DevOps, cloud, Kubernetes, SRE |
| `qa engineer` | QA, test automation, tester |
| `project manager` | PM, product manager, scrum master |
| `warehouse worker` | Sandėlio darbuotojas, logistikos specialistas |
| `driver` | Vairuotojas, kurjeris, ekspeditorius |
| `cleaner` | Valytoja, patalpų priežiūra |
| `sales assistant` | Pardavėjas, konsultantas, kasininkas |
| `accountant` | Buhalteris, finansininkas |
| `construction worker` | Statybininkas, montuotojas, suvirintojas |
| `cook` | Virėjas, konditeris, padavėjas |
| `security guard` | Apsaugos darbuotojas, sargybininkas |
| `manufacturing worker` | Gamybos darbuotojas, operatorius |
| `nurse` | Slaugytoja, gydytojas, farmaceutas |
| `hr specialist` | Personalo specialistas, recruiter |

Adding a new role: add an entry to `ROLE_KEYWORDS` in `title_matcher.py` (set `"apply_blacklist": False` for non-IT roles), add it to `LT_POSITION_MAP` if it has a common Lithuanian name, and add it to `POSITION_GROUPS` in both forms and `VALID_POSITIONS` in `cv-extract/route.ts`.

---

## Environment Variables

### Webapp (`webapp/.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...

NEXT_PUBLIC_APP_URL=https://gaukdarba.lt
OPENAI_API_KEY=sk-...
```

### GitHub Actions (repository secrets)

```
SUPABASE_URL
SUPABASE_SERVICE_KEY
OPENAI_API_KEY
RESEND_API_KEY
RESEND_FROM_EMAIL
```

---

## Scraper Pipeline

Two GitHub Actions workflows split the pipeline:

```
scraper.yml  → runs daily at 01:00 UTC  → Stage 1 (scrape all portals)
matcher.yml  → runs every hour          → Stages 2-4 (match + email)
```

Each stage is isolated — a failure in one stage does not abort the others.

### Stage 1 — Scrapers

| File | Source | Method |
|---|---|---|
| `scrape.py` | CVBankas.lt | HTTP + BeautifulSoup |
| `scrape_cvonline.py` | CV-Online.lt | HTTP + BeautifulSoup |
| `scrape_cvmarket.py` | CVmarket.lt | Playwright (Chromium) |
| `scrape_unicorns.py` | Unicorns.lt | Playwright (Chromium) |
| `scrape_uzt.py` | UZT.lt | HTTP + BeautifulSoup |

Playwright is installed in the scraper workflow via `playwright install chromium`.

### Stage 2 — Title Matcher (3-layer funnel)

Runs per active user against today's listings:

1. **SQL layer** — Filter by user's city and minimum salary.
2. **Keyword layer** — Role-specific whitelist/blacklist on job title text. IT blacklist only applies to IT roles — non-IT roles (warehouse, driver, etc.) are never filtered by IT terms.
3. **LLM layer** — GPT-4o-mini scores surviving titles 1-10. Keeps scores ≥ 5.

Unknown positions fall back to skill-keyword filtering (using the user's skills field) before the LLM step.

### Stage 3 — Detail Scraper

Fetches full job description pages for title-matched jobs. Stores text in `listing_details`.

### Stage 4 — Detail Matcher

GPT-4o-mini re-scores each match using the full description + user profile. Writes `detail_score` (1-10) and a `reason` explanation. Sends an email digest via Resend for matches scoring ≥ 7.

The matcher skips if it already ran today (guards against re-runs on every hourly trigger).

### Running manually

```bash
cd scraper
pip install -r requirements.txt
playwright install chromium

export SUPABASE_URL=...
export SUPABASE_SERVICE_KEY=...
export OPENAI_API_KEY=...
export RESEND_API_KEY=...
export RESEND_FROM_EMAIL="GaukDarba <noreply@gaukdarba.lt>"
export APP_URL=https://gaukdarba.lt

RUN_MODE=scraper python main.py   # Stage 1 only
RUN_MODE=matcher python main.py   # Stages 2-4 only
RUN_MODE=full    python main.py   # All stages
```

---

## Deployment

### Vercel (Webapp)

1. Connect the `webapp/` directory to a Vercel project.
2. Set all webapp environment variables in Vercel → Settings → Environment Variables.

### GitHub Actions (Scraper)

1. Push the repo to GitHub.
2. Add the required secrets under Settings → Secrets → Actions:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
3. Two workflows activate automatically:
   - **Scraper** (`scraper.yml`) — runs daily at 01:00 UTC, `RUN_MODE=scraper`
   - **Matcher** (`matcher.yml`) — runs every hour, `RUN_MODE=matcher`
4. Both can also be triggered manually from the GitHub Actions tab.

---

## Auth Flow

1. New users go through `/onboarding` — a multi-step wizard collecting email, job preferences, and work format. CV upload auto-fills preferences via OpenAI.
2. Step 1 sends a Supabase magic link. Clicking it exchanges the OTP at `/auth/callback` and returns to the wizard.
3. After finishing the wizard, users are redirected to Stripe Checkout. After payment, the Stripe webhook at `/api/stripe/webhook` sets `plan_status = 'active'`.
4. Returning users use `/login` — magic link or Google OAuth.

---

## Stripe Setup

1. Create a product in Stripe with a recurring monthly price of €10.
2. Copy the Price ID (`price_...`) to `STRIPE_PRICE_ID`.
3. Add a webhook endpoint pointing to `https://your-domain/api/stripe/webhook`.
4. Subscribe to: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
5. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`.

---

## Supabase Setup

1. Create a project at supabase.com.
2. Run migrations in order in the SQL Editor.
3. In Authentication → URL Configuration set:
   - **Site URL**: `https://your-domain.lt`
   - **Redirect URLs**: `https://your-domain.lt/auth/callback`
4. Copy the **Project URL** and **anon key** to webapp env vars.
5. Copy the **service_role key** to both webapp (`SUPABASE_SERVICE_ROLE_KEY`) and GitHub Actions secrets (`SUPABASE_SERVICE_KEY`).

---

## Resend Setup

1. Create an account at resend.com and verify your sending domain.
2. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (e.g. `GaukDarba <noreply@gaukdarba.lt>`).
3. Configure Supabase to use Resend for magic link delivery: Authentication → SMTP settings.

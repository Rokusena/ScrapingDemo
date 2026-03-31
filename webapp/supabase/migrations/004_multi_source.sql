-- Migration 004: Multi-source scraper support
-- Adds: source column to raw_listings, work_format to job_preferences, scraper_runs table

-- ─── Add source to raw_listings ────────────────────────────────────────────────
alter table raw_listings
  add column if not exists source text not null default 'cvbankas';

-- ─── Add work_format to job_preferences ───────────────────────────────────────
alter table job_preferences
  add column if not exists work_format text; -- 'remote' | 'hybrid' | 'onsite'

-- ─── scraper_runs logging table ───────────────────────────────────────────────
create table if not exists scraper_runs (
  id            uuid primary key default uuid_generate_v4(),
  source        text not null,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  jobs_found    int not null default 0,
  jobs_inserted int not null default 0,
  error         text,
  created_at    timestamptz not null default now()
);

alter table scraper_runs enable row level security;

-- Service role only — no user-facing reads needed
create policy "Service role full access to scraper_runs"
  on scraper_runs
  using (false)
  with check (false);

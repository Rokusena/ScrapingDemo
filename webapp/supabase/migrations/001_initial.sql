-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Enums
create type plan_status as enum ('free', 'active', 'cancelled');
create type experience_level as enum ('intern', 'junior', 'mid', 'senior');

-- ─── profiles ────────────────────────────────────────────────────────────────
create table profiles (
  id                uuid references auth.users(id) on delete cascade primary key,
  email             text not null,
  full_name         text,
  stripe_customer_id text,
  plan_status       plan_status not null default 'free',
  created_at        timestamptz not null default now()
);

-- ─── job_preferences ─────────────────────────────────────────────────────────
create table job_preferences (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid references profiles(id) on delete cascade not null unique,
  desired_position     text,
  skills               text,
  preferred_cities     text[],
  preferred_salary_min int,
  experience_level     experience_level,
  languages            text[],
  keywords             text,
  is_active            bool not null default true,
  updated_at           timestamptz not null default now()
);

-- ─── raw_listings ─────────────────────────────────────────────────────────────
create table raw_listings (
  id         uuid primary key default uuid_generate_v4(),
  job_id     text unique not null,
  title      text,
  company    text,
  salary_raw text,
  location   text,
  url        text,
  scraped_at timestamptz not null default now()
);

-- ─── listing_details ──────────────────────────────────────────────────────────
create table listing_details (
  id           uuid primary key default uuid_generate_v4(),
  job_id       text references raw_listings(job_id) on delete cascade not null,
  description  text,
  full_salary  text,
  requirements text,
  scraped_at   timestamptz not null default now()
);

-- ─── matches ──────────────────────────────────────────────────────────────────
create table matches (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references profiles(id) on delete cascade not null,
  job_id       text references raw_listings(job_id) on delete cascade not null,
  title_score  int check (title_score >= 1 and title_score <= 10),
  detail_score int check (detail_score >= 1 and detail_score <= 10),
  reason       text,
  matched_at   timestamptz not null default now(),
  notified     bool not null default false
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table profiles        enable row level security;
alter table job_preferences enable row level security;
alter table raw_listings    enable row level security;
alter table listing_details enable row level security;
alter table matches         enable row level security;

-- profiles
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- job_preferences
create policy "Users can view own preferences"
  on job_preferences for select using (auth.uid() = user_id);

create policy "Users can insert own preferences"
  on job_preferences for insert with check (auth.uid() = user_id);

create policy "Users can update own preferences"
  on job_preferences for update using (auth.uid() = user_id);

-- raw_listings — public read (scrapers write via service role)
create policy "Public read listings"
  on raw_listings for select using (true);

-- listing_details — public read
create policy "Public read listing details"
  on listing_details for select using (true);

-- matches
create policy "Users can view own matches"
  on matches for select using (auth.uid() = user_id);

-- ─── Auto-create profile on signup ───────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

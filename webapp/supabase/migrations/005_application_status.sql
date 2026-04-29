-- Migration 005: Application status tracking on matches

alter table matches
  add column if not exists application_status text,   -- null | 'applied' | 'ignored' | 'no_response' | 'rejected' | 'interview' | 'offer'
  add column if not exists applied_at timestamptz;

-- Index so the dashboard query filtering on status stays fast
create index if not exists matches_application_status_idx
  on matches (user_id, application_status);

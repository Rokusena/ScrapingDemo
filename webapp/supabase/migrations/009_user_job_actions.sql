-- Migration 009: Persistent user job actions table
-- Survives match cleanup so the scraper never re-matches a listing the user has already actioned.

CREATE TABLE IF NOT EXISTS user_job_actions (
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_id      text NOT NULL,
  status      text NOT NULL,
  actioned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id)
);

ALTER TABLE user_job_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own job actions"
  ON user_job_actions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

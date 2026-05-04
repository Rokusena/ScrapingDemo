-- Migration 006: Remove existing duplicate matches and prevent future ones

-- Keep the best row per (user_id, job_id):
-- highest detail_score wins; ties broken by latest matched_at
DELETE FROM matches
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, job_id) id
  FROM matches
  ORDER BY user_id, job_id,
           detail_score DESC NULLS LAST,
           matched_at   DESC
);

-- Enforce uniqueness going forward
ALTER TABLE matches
  ADD CONSTRAINT matches_user_job_unique UNIQUE (user_id, job_id);

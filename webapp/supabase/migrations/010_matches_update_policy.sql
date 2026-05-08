-- Migration 010: Allow users to update their own matches (needed for application_status)
-- The initial schema only had a SELECT policy — UPDATE was blocked by RLS.

CREATE POLICY "Users can update own matches"
  ON matches FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

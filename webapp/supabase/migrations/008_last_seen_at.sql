-- Migration 008: Add last_seen_at for staleness tracking
-- Used by the weekly full-sweep to identify listings that have expired/been removed.
-- Daily incremental runs only update last_seen_at on pages they visit (early-stop).
-- Weekly runs visit all pages and refresh last_seen_at on every listing seen.
-- Cleanup in main.py deletes non-UZT listings where last_seen_at < now() - 8 days.

ALTER TABLE raw_listings
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Backfill so existing rows are not immediately deleted on first cleanup run
UPDATE raw_listings
  SET last_seen_at = scraped_at
  WHERE last_seen_at IS NULL;

CREATE INDEX IF NOT EXISTS raw_listings_last_seen_at_idx
  ON raw_listings (source, last_seen_at);

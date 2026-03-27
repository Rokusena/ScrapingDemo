-- Tracks scrape runs to enforce minimum 24h between scrapes.
-- Singleton table: only one row, upserted after each scrape.

CREATE TABLE scrape_metadata (
    id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    last_scrape_started_at  TIMESTAMPTZ,
    last_scrape_finished_at TIMESTAMPTZ,
    listings_count          INTEGER,
    next_scrape_after       TIMESTAMPTZ  -- last_scrape_started_at + 24h
);

-- Seed with one row so upserts always have a target
INSERT INTO scrape_metadata (last_scrape_started_at, last_scrape_finished_at, listings_count, next_scrape_after)
VALUES (NULL, NULL, 0, NULL);

-- One detail row per job listing (required for upsert in detail_scraper)
alter table listing_details
  add constraint listing_details_job_id_key unique (job_id);

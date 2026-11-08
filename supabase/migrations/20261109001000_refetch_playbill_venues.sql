-- Playbill venue parsing (#444, Playbill London crawl 2026-11-08): a UK postcode inside the street ("The Strand,
-- London WC2E 7NA") is now its own field and implies GB, so postcodes.io can geocode it, and "(formerly …)" moves
-- out of the venue name into former_names. Only venue output changed, so the parser version stays and just the
-- Playbill venue pages (about 90) are re-fetched instead of every Playbill page.
update public.crawl_tasks t set status = 'pending', available_at = clock_timestamp(),
  etag = null, last_modified = null, consecutive_failures = 0,
  lease_owner = null, lease_token = null, lease_expires_at = null
from public.crawl_sources s
where s.id = t.source_id and s.source_key = 'playbill' and t.stage = 'venue' and t.status = 'succeeded';

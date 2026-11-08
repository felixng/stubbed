-- Street-address geocoding fix (#444, Playbill probe 2026-11-08). The worker now treats several Nominatim
-- objects in one building as one place, prefers a lone performance venue among far-apart answers, and drops
-- bracketed notes from the street. 15 of 41 Broadway addresses had been cached as definitive misses under the
-- old rule, which kept their venues held. Forget those misses and re-fetch venue pages so the next run
-- geocodes them again (about 100 pages; Nominatim stays at one request per 1.1 s).
delete from public.crawl_geocodes where provider = 'nominatim' and not found;

update public.crawl_tasks t set status = 'pending', available_at = clock_timestamp(),
  etag = null, last_modified = null, consecutive_failures = 0,
  lease_owner = null, lease_token = null, lease_expires_at = null
from public.crawl_sources s
where s.id = t.source_id and s.source_key in ('playbill', 'london_theatre')
  and t.stage = 'venue' and t.status = 'succeeded';

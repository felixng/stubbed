-- Register the deterministic Playbill parser without activating either switch.
update public.crawl_sources set adapter_version = 'playbill-v1'
where source_key = 'playbill';

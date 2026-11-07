-- Register the installed parser. Source enable flags stay as configured.
update public.crawl_sources set adapter_version = 'london-theatre-v1'
where source_key = 'london_theatre';

create or replace function public.claim_crawl_task(for_source text, for_stage text, for_scope text, worker text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  source uuid;
  claimed public.crawl_tasks%rowtype;
begin
  select id into source from public.crawl_sources
  where source_key = for_source and collection_enabled and paused_reason is null for share;
  if not found then return null; end if;

  with candidate as (
    select t.id
    from public.crawl_tasks t
    join public.crawl_generations g on g.id = t.generation_id
    left join public.crawl_hosts h on h.host = substring(t.canonical_url from '^https?://([^/]+)/')
    where t.source_id = source and g.is_current and g.paused_reason is null
      and (for_scope is null or g.scope_key = for_scope)
      and (for_stage = 'all' or t.stage = for_stage)
      -- Let the request gate wait out an ordinary pacing gap. Long
      -- cooldowns stay in the queue without consuming a page attempt.
      and (h.available_at is null or h.available_at <= clock_timestamp() + interval '20 seconds')
      and (
        (t.status in ('pending', 'retry_wait') and t.available_at <= clock_timestamp())
        or (t.status = 'leased' and t.lease_expires_at <= clock_timestamp())
      )
    order by t.priority desc, t.available_at, t.id
    limit 1 for update of t skip locked
  )
  update public.crawl_tasks t set status = 'leased', attempts = t.attempts + 1,
    lease_owner = worker, lease_token = gen_random_uuid(), lease_expires_at = clock_timestamp() + interval '5 minutes'
  from candidate c where t.id = c.id returning t.* into claimed;

  if not found then return null; end if;
  return to_jsonb(claimed) || jsonb_build_object('has_extraction', exists (
    select 1 from public.crawl_extractions e where e.task_id = claimed.id
      and e.parser_version = claimed.parser_version and e.content_hash = claimed.content_hash
  ));
end;
$$;

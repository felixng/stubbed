-- An official site's tasks may be on its archive host as well as its what's-on host (#542, epic #536).
-- Copied whole from 20261107171716_crawl_frontier.sql; only the official-site host test changes.
create or replace function public.enqueue_crawl_task(
  for_generation uuid, task_stage text, task_url text
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  source uuid;
  task uuid;
  target_host text := substring(task_url from '^https?://([a-z0-9.-]+)/');
begin
  select s.id into source
  from public.crawl_generations g
  join public.crawl_sources s on s.id = g.source_id
  left join public.crawl_sites site on site.id = g.site_id
  where g.id = for_generation and g.is_current
    and s.collection_enabled and s.paused_reason is null
    and (
      target_host = any(s.allowed_hosts)
      -- An official site's own pages: its what's-on host or its archive host, ignoring a leading www.
      or (s.source_key = 'official' and regexp_replace(target_host, '^www\.', '') in (
        regexp_replace(coalesce(substring(site.whats_on_url from '^https?://([a-z0-9.-]+)(/|$)'), ''), '^www\.', ''),
        regexp_replace(coalesce(substring(site.archive_url from '^https?://([a-z0-9.-]+)(/|$)'), ''), '^www\.', '')))
    )
  for share of s;

  if not found then
    raise exception 'Disabled crawl scope or URL outside its allowlist' using errcode = '22023';
  end if;

  insert into public.crawl_tasks (source_id, generation_id, stage, canonical_url)
  values (source, for_generation, task_stage, task_url)
  on conflict (source_id, stage, canonical_url, generation_id) do nothing
  returning id into task;

  if task is null then
    select id into strict task from public.crawl_tasks
    where source_id = source and generation_id = for_generation
      and stage = task_stage and canonical_url = task_url;
  end if;
  return task;
end;
$$;

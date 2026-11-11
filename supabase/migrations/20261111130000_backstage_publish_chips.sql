-- Backstage switches (owner, 2026-11-10): Publish per source and Run chips for everyone become buttons on
-- Backstage > Crawl > Sources instead of SQL. Publish joins the audited source actions; admins read the consumer
-- flags through admin_catalogue_flags and change Run chips with the existing admin_set_catalogue_flag. Autofill stays
-- a database-only switch until its accuracy gate passes.

create or replace function public.admin_crawl_source_action(
  for_source text, operation text, for_generation uuid default null, for_task uuid default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  source public.crawl_sources%rowtype;
  scan public.crawl_generations%rowtype;
  seed public.crawl_tasks%rowtype;
  target_scan uuid;
  changed integer := 0;
begin
  if not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into source from public.crawl_sources where source_key = for_source for update;
  if not found then raise exception 'Unknown source' using errcode = '22023'; end if;

  if operation in ('pause','resume') then
    update public.crawl_sources set operator_paused_at =
      case when operation = 'pause' then coalesce(operator_paused_at, now()) end
    where id = source.id;
    changed := 1;
  elsif operation in ('publish_on','publish_off') then
    -- Publication puts validated evidence into the catalogue on the next crawl run. A withdrawn source must be
    -- reinstated first, so its evidence can't come back by accident.
    if operation = 'publish_on' and source.withdrawn_at is not null then
      raise exception 'Reinstate this source before publishing' using errcode = '22023';
    end if;
    update public.crawl_sources set publication_enabled = (operation = 'publish_on')
    where id = source.id and publication_enabled is distinct from (operation = 'publish_on');
    get diagnostics changed = row_count;
  else
    select * into scan from public.crawl_generations
    where id = for_generation and source_id = source.id and is_current for update;
    if not found then raise exception 'Select a current scan' using errcode = '22023'; end if;
    target_scan := scan.id;
    if for_task is not null and not exists (
      select 1 from public.crawl_tasks where id = for_task and generation_id = scan.id
    ) then raise exception 'Task does not belong to this scan' using errcode = '22023'; end if;

    if operation in ('retry_failed','retry_blocked','reparse') then
      update public.crawl_tasks t set status = 'pending', available_at = now(), consecutive_failures = 0,
        lease_owner = null, lease_token = null, lease_expires_at = null,
        etag = case when operation = 'reparse' then null else t.etag end,
        last_modified = case when operation = 'reparse' then null else t.last_modified end
      where t.generation_id = scan.id and (for_task is null or t.id = for_task)
        and ((operation = 'retry_failed' and t.status in ('failed','retry_wait'))
          or (operation = 'retry_blocked' and t.status = 'blocked')
          or (operation = 'reparse' and t.status <> 'blocked'));
      get diagnostics changed = row_count;
      if operation = 'retry_blocked' and changed > 0 then
        update public.crawl_sources set paused_reason = null where id = source.id;
        update public.crawl_generations set paused_reason = null where id = scan.id;
      end if;
      if operation = 'reparse' and exists (
        select 1 from public.crawl_tasks where generation_id = scan.id and stage = 'directory' and status = 'pending'
      ) then
        update public.crawl_generations set enumeration_status = 'enumerating', completed_at = null
        where id = scan.id and enumeration_status = 'enumerated';
      end if;
    elsif operation = 'rediscover' then
      if not source.collection_enabled or source.operator_paused_at is not null then
        raise exception 'Resume an enabled source before rediscovery' using errcode = '22023';
      end if;
      select * into seed from public.crawl_tasks where generation_id = scan.id
      order by discovered_at, case stage when 'directory' then 0 when 'venue' then 1 else 2 end, id limit 1;
      if not found then raise exception 'This scan has no seed' using errcode = '22023'; end if;
      target_scan := public.start_crawl_generation(source.source_key, scan.scope_key, seed.stage, seed.canonical_url, scan.site_id, true);
      changed := 1;
    else
      raise exception 'Unknown crawl action' using errcode = '22023';
    end if;
  end if;

  insert into public.crawl_admin_actions(actor_id, source_id, generation_id, task_id, operation, affected)
  values (auth.uid(), source.id, target_scan, for_task, operation, changed);
  return changed;
end;
$$;

create or replace function public.admin_catalogue_flags()
returns table (flag text, enabled boolean, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query select f.flag, f.enabled, f.updated_at from public.catalogue_consumer_flags f order by f.flag;
end;
$$;

revoke all on function public.admin_catalogue_flags() from public, anon;
grant execute on function public.admin_catalogue_flags() to authenticated;

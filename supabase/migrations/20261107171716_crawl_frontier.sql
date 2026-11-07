-- Durable, private discovery frontier. The existing official-site worker
-- continues to use crawl_sites, crawl_pages, crawl_runs and crawl_findings.
create table public.crawl_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique check (source_key ~ '^[a-z][a-z0-9_]*$'),
  adapter_version text not null,
  collection_enabled boolean not null default false,
  publication_enabled boolean not null default false,
  paused_reason text,
  allowed_hosts text[] not null default '{}',
  min_interval_ms integer not null default 5000 check (min_interval_ms >= 1000)
);

insert into public.crawl_sources
  (source_key, adapter_version, collection_enabled, allowed_hosts, min_interval_ms)
values
  ('official', 'legacy', true, '{}', 2000),
  ('london_theatre', 'unconfigured', false, array['www.londontheatre.co.uk', 'londontheatre.co.uk'], 5000),
  ('playbill', 'unconfigured', false, array['playbill.com', 'www.playbill.com'], 5000);

create table public.crawl_generations (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.crawl_sources (id),
  site_id uuid references public.crawl_sites (id) on delete set null,
  scope_key text not null check (scope_key <> ''),
  is_current boolean not null default true,
  enumeration_status text not null default 'enumerating'
    check (enumeration_status in ('enumerating', 'enumerated', 'not_applicable')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, source_id),
  check ((enumeration_status = 'enumerated') = (completed_at is not null))
);

create unique index crawl_generations_current
  on public.crawl_generations (source_id, scope_key) where is_current;
create index crawl_generations_site on public.crawl_generations (site_id) where site_id is not null;

create table public.crawl_tasks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null,
  generation_id uuid not null,
  canonical_url text not null check (
    length(canonical_url) <= 2048 and
    canonical_url ~ '^https?://[a-z0-9.-]+/' and canonical_url !~ '[#[:space:]]'
  ),
  stage text not null check (stage in ('directory', 'venue', 'event')),
  status text not null default 'pending'
    check (status in ('pending', 'leased', 'succeeded', 'retry_wait', 'blocked', 'failed')),
  priority integer not null default 0,
  available_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  discovered_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error text,
  parser_version text,
  content_hash text,
  foreign key (generation_id, source_id) references public.crawl_generations (id, source_id),
  unique (source_id, stage, canonical_url, generation_id),
  unique (generation_id, id),
  check (
    (status = 'leased' and lease_owner is not null and lease_token is not null and lease_expires_at is not null)
    or (status <> 'leased' and lease_owner is null and lease_token is null and lease_expires_at is null)
  )
);

create index crawl_tasks_generation_stage on public.crawl_tasks (generation_id, stage);

create index crawl_tasks_due
  on public.crawl_tasks (source_id, stage, available_at, priority desc)
  where status in ('pending', 'retry_wait');
create index crawl_tasks_expired
  on public.crawl_tasks (source_id, stage, lease_expires_at) where status = 'leased';

create table public.crawl_task_edges (
  generation_id uuid not null,
  parent_id uuid not null,
  child_id uuid not null,
  primary key (parent_id, child_id),
  foreign key (generation_id, parent_id) references public.crawl_tasks (generation_id, id) on delete cascade,
  foreign key (generation_id, child_id) references public.crawl_tasks (generation_id, id) on delete cascade,
  check (parent_id <> child_id)
);

create index crawl_task_edges_child on public.crawl_task_edges (child_id);

create table public.crawl_source_entities (
  source_id uuid not null references public.crawl_sources (id),
  entity_kind text not null check (entity_kind in ('venue', 'event')),
  external_key text not null check (length(external_key) between 1 and 500),
  venue_id uuid references public.venues (id) on delete set null,
  show_id uuid references public.shows (id) on delete set null,
  first_seen_at timestamptz not null default now(),
  primary key (source_id, entity_kind, external_key),
  check (entity_kind <> 'venue' or show_id is null)
);

create index crawl_source_entities_venue on public.crawl_source_entities (venue_id) where venue_id is not null;
create index crawl_source_entities_show on public.crawl_source_entities (show_id) where show_id is not null;

-- One versioned batch of extracted observations, without a stored page body.
-- Publication is a separate durable operation; #423/#424 own its consumer.
create table public.crawl_extractions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.crawl_tasks (id),
  parser_version text not null check (length(parser_version) between 1 and 100),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  observations jsonb not null check (jsonb_typeof(observations) = 'array'),
  extracted_at timestamptz not null default now(),
  unique (task_id, parser_version, content_hash)
);

create table public.crawl_publication_queue (
  extraction_id uuid primary key references public.crawl_extractions (id),
  queued_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'crawl_sources', 'crawl_generations', 'crawl_tasks', 'crawl_task_edges',
    'crawl_source_entities', 'crawl_extractions', 'crawl_publication_queue'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
    execute format(
      'create policy "Admins read frontier" on public.%I for select to authenticated using ((select public.is_admin()))',
      table_name
    );
  end loop;
end;
$$;

-- Called inside the worker's acknowledgement transaction (and by explicit
-- seed operations). URL syntax is canonicalised by the adapter boundary.
create function public.enqueue_crawl_task(
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
      or (s.source_key = 'official' and target_host = substring(site.whats_on_url from '^https?://([a-z0-9.-]+)(/|$)'))
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

-- Resume returns the current generation without reseeding it. Refresh creates
-- a generation and its first task in one transaction, retaining older work.
create function public.start_crawl_generation(
  for_source text, for_scope text, seed_stage text, seed_url text,
  for_site uuid default null, refresh boolean default false
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  source uuid;
  generation uuid;
begin
  select id into source from public.crawl_sources
  where source_key = for_source and collection_enabled and paused_reason is null
  for update;
  if not found then
    raise exception 'Unknown or disabled crawl source' using errcode = '22023';
  end if;

  select id into generation from public.crawl_generations
  where source_id = source and scope_key = for_scope and is_current;
  if found and not refresh then return generation; end if;

  update public.crawl_generations set is_current = false where id = generation;
  insert into public.crawl_generations (source_id, scope_key, site_id, enumeration_status)
  values (source, for_scope, for_site, case when seed_stage = 'directory' then 'enumerating' else 'not_applicable' end)
  returning id into generation;
  perform public.enqueue_crawl_task(generation, seed_stage, seed_url);
  return generation;
end;
$$;

create function public.acknowledge_crawl_task(
  for_task uuid, for_token uuid, parsed_version text, parsed_hash text,
  child_tasks jsonb, parsed_observations jsonb
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  parent public.crawl_tasks%rowtype;
  child record;
  child_task uuid;
  extraction uuid;
begin
  -- Source pause and refresh must serialize with commits. Lock in that order.
  perform 1 from public.crawl_sources s
  join public.crawl_tasks t on t.source_id = s.id
  where t.id = for_task and s.collection_enabled and s.paused_reason is null
  for share of s;
  if not found then return false; end if;

  perform 1 from public.crawl_generations g
  join public.crawl_tasks t on t.generation_id = g.id
  where t.id = for_task and g.is_current
  for update of g;
  if not found then return false; end if;

  select * into parent from public.crawl_tasks
  where id = for_task and status = 'leased'
    and lease_token = for_token and lease_expires_at > clock_timestamp()
  for update;
  if not found then return false; end if;

  if jsonb_typeof(child_tasks) is distinct from 'array'
     or jsonb_typeof(parsed_observations) is distinct from 'array' then
    raise exception 'Expected arrays for child tasks and observations' using errcode = '22023';
  end if;

  for child in
    select distinct stage, url from jsonb_to_recordset(child_tasks) as item(stage text, url text)
    order by stage, url
  loop
    child_task := public.enqueue_crawl_task(parent.generation_id, child.stage, child.url);
    if child_task <> parent.id then
      insert into public.crawl_task_edges (generation_id, parent_id, child_id)
      values (parent.generation_id, parent.id, child_task) on conflict do nothing;
    end if;
  end loop;

  insert into public.crawl_extractions (task_id, parser_version, content_hash, observations)
  values (parent.id, parsed_version, parsed_hash, parsed_observations)
  on conflict (task_id, parser_version, content_hash) do nothing
  returning id into extraction;

  if extraction is not null and jsonb_array_length(parsed_observations) > 0 then
    insert into public.crawl_publication_queue (extraction_id) values (extraction);
  end if;

  update public.crawl_tasks set
    status = 'succeeded', last_success_at = now(), last_error = null,
    parser_version = parsed_version, content_hash = parsed_hash,
    lease_owner = null, lease_token = null, lease_expires_at = null
  where id = parent.id;

  if parent.stage = 'directory' and not exists (
    select 1 from public.crawl_tasks
    where generation_id = parent.generation_id and stage = 'directory' and status <> 'succeeded'
  ) then
    update public.crawl_generations set enumeration_status = 'enumerated', completed_at = now()
    where id = parent.generation_id and enumeration_status = 'enumerating';
  end if;
  return true;
end;
$$;

revoke all on function public.enqueue_crawl_task(uuid, text, text),
  public.start_crawl_generation(text, text, text, text, uuid, boolean),
  public.acknowledge_crawl_task(uuid, uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.enqueue_crawl_task(uuid, text, text),
  public.start_crawl_generation(text, text, text, text, uuid, boolean),
  public.acknowledge_crawl_task(uuid, uuid, text, text, jsonb, jsonb) to service_role;

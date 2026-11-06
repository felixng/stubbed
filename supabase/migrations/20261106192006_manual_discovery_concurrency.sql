alter table public.crawl_runs add column pipeline text not null default 'legacy' check(pipeline in ('legacy','discover'));

create or replace function public.admin_create_crawl_run(settings jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ids uuid[]; new_id uuid;
begin
  if not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if jsonb_typeof(settings->'venue_ids') is distinct from 'array' then raise exception 'Invalid theatres'; end if;
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(settings->'venue_ids');
  if coalesce(cardinality(ids), 0) not between 1 and 10
    or (select count(distinct v.id) from public.venues v where v.id = any(ids) and (coalesce(settings->>'pipeline','discover') <> 'legacy' or nullif(btrim(v.whats_on_url), '') is not null)) <> cardinality(ids)
    then raise exception 'Choose 1–10 different theatres with links'; end if;
  if coalesce(settings->>'pipeline','discover') not in ('discover','legacy') then raise exception 'Invalid pipeline'; end if;
  if coalesce(settings->>'method', '') not in ('rules', 'rules_model')
    or coalesce(settings->>'model', '') not in ('claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5')
    or coalesce(settings->>'kind', '') not in ('whats_on', 'show_names')
    or coalesce(settings->>'branch', '') !~ '^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$'
    or settings->>'branch' like '%..%' or settings->>'branch' like '%/'
    or coalesce(char_length(settings->>'prompt'), 0) > 20000
    or jsonb_typeof(settings->'budget_usd') is distinct from 'number'
    then raise exception 'Invalid settings'; end if;
  if (settings->>'budget_usd')::numeric not between 0 and 10
    or (settings->>'method' = 'rules_model' and (settings->>'budget_usd')::numeric = 0)
    then raise exception 'Invalid budget'; end if;
  insert into public.crawl_runs(venue_ids, method, model, prompt, budget_usd, branch, kind, created_by, pipeline)
    values(ids, settings->>'method', settings->>'model', settings->>'prompt', (settings->>'budget_usd')::numeric, settings->>'branch', settings->>'kind', auth.uid(), coalesce(settings->>'pipeline','discover'))
    returning id into new_id;
  return new_id;
end $$;

-- Leases guard rule activation and publication if two selected venues resolve
-- to the same site. A crashed worker's claim expires after the job's time limit.
create table public.crawl_site_leases (
 site_id uuid primary key references public.crawl_sites on delete cascade,
 owner uuid not null,
 run_id uuid not null references public.crawl_runs on delete cascade,
 expires_at timestamptz not null
);
alter table public.crawl_site_leases enable row level security;
revoke all on public.crawl_site_leases from anon,authenticated;
grant all on public.crawl_site_leases to service_role;
create function public.claim_crawl_site(for_site uuid,for_run uuid,worker uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 insert into public.crawl_site_leases(site_id,owner,run_id,expires_at)
 values(for_site,worker,for_run,now()+interval '30 minutes')
 on conflict(site_id) do update set owner=excluded.owner,run_id=excluded.run_id,expires_at=excluded.expires_at
 where crawl_site_leases.expires_at < now() or crawl_site_leases.owner=worker;
 return found;
end $$;
create function public.release_crawl_site(for_site uuid,worker uuid) returns void
language sql security definer set search_path='' as $$
 delete from public.crawl_site_leases where site_id=for_site and owner=worker;
$$;
revoke execute on function public.claim_crawl_site(uuid,uuid,uuid) from public,anon,authenticated;
revoke execute on function public.release_crawl_site(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_crawl_site(uuid,uuid,uuid) to service_role;
grant execute on function public.release_crawl_site(uuid,uuid) to service_role;

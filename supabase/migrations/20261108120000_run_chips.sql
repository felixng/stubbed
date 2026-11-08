-- Validated run suggestions, chips first (#278, epic #419).
-- Additive: suggest_shows(uuid[], date) is unchanged for older clients. New
-- clients call suggest_shows_v2, which returns the same rows plus run chips
-- and optional metadata. Flags are server-owned, independent and default off;
-- a missing or unreadable flag reads as off, and neither flag gates manual
-- search or the #360 community/yours chips.

create table public.catalogue_consumer_flags (
  flag text primary key check (flag in ('catalogue_run_chips_enabled', 'catalogue_run_autofill_enabled')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.catalogue_consumer_flags (flag) values
  ('catalogue_run_chips_enabled'), ('catalogue_run_autofill_enabled');
alter table public.catalogue_consumer_flags enable row level security;
revoke all on public.catalogue_consumer_flags from public, anon, authenticated;
grant select, update on public.catalogue_consumer_flags to service_role;

create function public.catalogue_flag(name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select f.enabled from public.catalogue_consumer_flags f where f.flag = name), false);
$$;
revoke execute on function public.catalogue_flag(text) from public, anon, authenticated;
grant execute on function public.catalogue_flag(text) to service_role;

-- Admins switch a flag; the change is immediate (the next suggestion call).
create function public.admin_set_catalogue_flag(flag_name text, value boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'admins only' using errcode = '42501'; end if;
  update public.catalogue_consumer_flags set enabled = value, updated_at = now() where flag = flag_name;
  return found;
end;
$$;
revoke execute on function public.admin_set_catalogue_flag(text, boolean) from public, anon;
grant execute on function public.admin_set_catalogue_flag(text, boolean) to authenticated;

-- Run chips from validated, non-withdrawn evidence only (catalogue_effective_runs).
-- A date matches only inside an explicit supported interval:
--   specific performance dates, or start .. (closing | booking horizon | scheduled end).
-- An unknown end matches the start date itself and nothing later. Cancelled,
-- conflicting and legacy rows never match. Several shows at a venue are all
-- offered; the same show is offered once (the most recently observed run).
create function public.suggest_shows_v2(venue_ids uuid[], on_date date)
returns table (
  show_id uuid, title text, venue_id uuid, source text, score numeric,
  run_id uuid, eligibility_reason text, autofill_eligible boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  ids uuid[];
begin
  if (select auth.uid()) is null then return; end if;
  ids := (select coalesce(array_agg(v), '{}') from (
    select distinct v from unnest(coalesce(venue_ids, '{}'::uuid[])) v limit 10) x);

  return query
  with base as (
    select s.show_id, s.title, s.venue_id, s.source, s.score
    from public.suggest_shows(ids, on_date) s
  ),
  runs as (
    select r.*, case
        when cardinality(r.performance_dates) > 0 then 'specific_date'
        when r.confirmed_end_date is not null then 'confirmed_closing'
        when r.booking_until is not null then 'booking_horizon'
        when r.scheduled_end_date is not null then 'scheduled_end'
        else 'start_date' end as reason
    from public.catalogue_effective_runs r
    where public.catalogue_flag('catalogue_run_chips_enabled')
      and on_date is not null
      and r.venue_id = any(ids)
      and not r.legacy and not r.cancelled and not r.conflicting
      and not (on_date = any(r.exception_dates))
      and (
        (cardinality(r.performance_dates) > 0 and on_date = any(r.performance_dates))
        or (cardinality(r.performance_dates) = 0 and r.start_date <= on_date
            and on_date <= coalesce(r.confirmed_end_date, r.booking_until, r.scheduled_end_date, r.start_date))
      )
  ),
  best as (
    select distinct on (r.venue_id, coalesce(r.show_id::text, 't:' || lower(btrim(r.title))))
      r.* from runs r
    order by r.venue_id, coalesce(r.show_id::text, 't:' || lower(btrim(r.title))), r.last_observed_at desc, r.id
  ),
  capped as (
    select b.*, row_number() over (order by b.last_observed_at desc, b.id) as rn
    from best b
    where not exists (select 1 from base x where x.show_id is not distinct from b.show_id
      and x.venue_id = b.venue_id and b.show_id is not null)
  ),
  only_one as (select count(*) as n from capped where rn <= 3)
  select u.show_id, u.title, u.venue_id, u.source, u.score, u.run_id, u.eligibility_reason, u.autofill_eligible
  from (
    select base.show_id, base.title, base.venue_id, base.source, base.score,
           null::uuid as run_id, null::text as eligibility_reason, false as autofill_eligible, 0 as grp
    from base
    union all
    select c.show_id, c.title, c.venue_id, 'run'::text, 1::numeric, c.id, c.reason,
      -- Autofill needs its own flag, one exact venue, one unambiguous resolved
      -- show with an explicit closing, and fresh current evidence.
      (public.catalogue_flag('catalogue_run_autofill_enabled')
        and cardinality(ids) = 1 and (select n from only_one) = 1
        and c.show_id is not null and c.reason = 'confirmed_closing'
        and c.autofill_eligible), 1
    from capped c where c.rn <= 3
  ) u
  order by u.grp, u.score desc, u.title;
end;
$$;
revoke execute on function public.suggest_shows_v2(uuid[], date) from public, anon;
grant execute on function public.suggest_shows_v2(uuid[], date) to authenticated;

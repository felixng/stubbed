-- Review crawl results (#359): mark findings right or wrong, record the titles
-- a run missed, score runs, and compare two runs. Admin only; counts and the
-- admin's own marks, nothing about users.

-- Titles a theatre has on that the run didn't find. Admin read; written by the
-- functions below.
create table public.crawl_missed (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references public.crawl_runs (id) on delete cascade,
  venue_id   uuid references public.venues (id) on delete set null,
  title      text not null check (char_length(btrim(title)) between 1 and 300),
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index crawl_missed_run on public.crawl_missed (run_id);
create index crawl_missed_venue on public.crawl_missed (venue_id);

alter table public.crawl_missed enable row level security;
revoke all on public.crawl_missed from anon, authenticated;
grant select on public.crawl_missed to authenticated;
create policy "Admins read missed titles"
  on public.crawl_missed for select
  to authenticated
  using (public.is_admin());

-- Mark a finding right, wrong or unsure (null clears it), with a note.
create function public.admin_review_finding(finding_id uuid, new_review text, new_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if new_review is not null and new_review not in ('right', 'wrong', 'unsure') then
    raise exception 'A mark is right, wrong or unsure' using errcode = '22023';
  end if;
  update public.crawl_findings f
  set review = new_review, review_note = nullif(btrim(coalesce(new_note, '')), '')
  where f.id = admin_review_finding.finding_id;
  get diagnostics changed = row_count;
  if changed = 0 then
    raise exception 'No such finding' using errcode = 'P0002';
  end if;
end;
$$;

create function public.admin_add_missed_title(for_run uuid, for_venue uuid, missed_title text, missed_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(missed_title, ''))) not between 1 and 300 then
    raise exception 'A title is 1 to 300 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.crawl_runs r where r.id = for_run) then
    raise exception 'No such run' using errcode = 'P0002';
  end if;
  insert into public.crawl_missed (run_id, venue_id, title, note)
  values (for_run, for_venue, btrim(missed_title), nullif(btrim(coalesce(missed_note, '')), ''))
  returning id into new_id;
  return new_id;
end;
$$;

create function public.admin_delete_missed_title(missed_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  delete from public.crawl_missed m where m.id = admin_delete_missed_title.missed_id;
end;
$$;

-- Per theatre for one run: how many findings, how they were marked, and how
-- many titles were missed. venue_id null is the findings no theatre was
-- matched to. Share right is right / (right + wrong), left to the caller.
create function public.admin_crawl_scores(for_run uuid)
returns table (
  venue_id    uuid,
  venue_name  text,
  findings    bigint,
  right_count bigint,
  wrong_count bigint,
  unsure_count bigint,
  unreviewed  bigint,
  missed      bigint
)
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
  with f as (
    select x.venue_id as vid, count(*) as n,
           count(*) filter (where x.review = 'right') as r,
           count(*) filter (where x.review = 'wrong') as w,
           count(*) filter (where x.review = 'unsure') as u,
           count(*) filter (where x.review is null) as nr
    from public.crawl_findings x where x.run_id = for_run group by x.venue_id
  ),
  m as (
    select y.venue_id as vid, count(*) as n from public.crawl_missed y where y.run_id = for_run group by y.venue_id
  ),
  ids as (select vid from f union select vid from m)
  select i.vid, v.name, coalesce(f.n, 0), coalesce(f.r, 0), coalesce(f.w, 0), coalesce(f.u, 0), coalesce(f.nr, 0), coalesce(m.n, 0)
  from ids i
  left join f on f.vid is not distinct from i.vid
  left join m on m.vid is not distinct from i.vid
  left join public.venues v on v.id = i.vid
  order by v.name nulls last;
end;
$$;

-- What changed between two runs: findings are the same thing when they are for
-- the same theatre with the same title (once normalised). 'same' also has the
-- same dates; 'changed' has the same title with different dates or stage.
-- `carried_review` is run A's mark when the title and dates match and B has
-- none yet, so a reviewer doesn't mark the same finding twice.
create function public.admin_compare_runs(run_a uuid, run_b uuid, for_venue uuid default null)
returns table (
  status         text,
  venue_id       uuid,
  venue_name     text,
  raw_title      text,
  a_finding      uuid,
  b_finding      uuid,
  a_dates        text,
  b_dates        text,
  a_stage        text,
  b_stage        text,
  a_review       text,
  b_review       text,
  carried_review text
)
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
  with a as (
    select distinct on (x.venue_id, public.normalise_search_text(x.raw_title)) x.*,
           public.normalise_search_text(x.raw_title) as k
    from public.crawl_findings x
    where x.run_id = run_a and (for_venue is null or x.venue_id = for_venue)
    order by x.venue_id, public.normalise_search_text(x.raw_title), x.start_date nulls last, x.id
  ),
  b as (
    select distinct on (x.venue_id, public.normalise_search_text(x.raw_title)) x.*,
           public.normalise_search_text(x.raw_title) as k
    from public.crawl_findings x
    where x.run_id = run_b and (for_venue is null or x.venue_id = for_venue)
    order by x.venue_id, public.normalise_search_text(x.raw_title), x.start_date nulls last, x.id
  )
  select case when a.id is null then 'added'
              when b.id is null then 'lost'
              when (a.start_date, a.end_date) is not distinct from (b.start_date, b.end_date)
                   and a.stage_text is not distinct from b.stage_text then 'same'
              else 'changed' end,
         coalesce(a.venue_id, b.venue_id), v.name, coalesce(b.raw_title, a.raw_title),
         a.id, b.id,
         concat_ws(' to ', a.start_date::text, a.end_date::text), concat_ws(' to ', b.start_date::text, b.end_date::text),
         a.stage_text, b.stage_text, a.review, b.review,
         case when a.id is not null and b.id is not null and b.review is null
                   and (a.start_date, a.end_date) is not distinct from (b.start_date, b.end_date)
              then a.review end
  from a
  full join b on a.venue_id is not distinct from b.venue_id and a.k = b.k
  left join public.venues v on v.id = coalesce(a.venue_id, b.venue_id)
  order by v.name nulls last, coalesce(b.raw_title, a.raw_title);
end;
$$;

revoke execute on function public.admin_review_finding(uuid, text, text) from public, anon;
grant execute on function public.admin_review_finding(uuid, text, text) to authenticated;
revoke execute on function public.admin_add_missed_title(uuid, uuid, text, text) from public, anon;
grant execute on function public.admin_add_missed_title(uuid, uuid, text, text) to authenticated;
revoke execute on function public.admin_delete_missed_title(uuid) from public, anon;
grant execute on function public.admin_delete_missed_title(uuid) to authenticated;
revoke execute on function public.admin_crawl_scores(uuid) from public, anon;
grant execute on function public.admin_crawl_scores(uuid) to authenticated;
revoke execute on function public.admin_compare_runs(uuid, uuid, uuid) from public, anon;
grant execute on function public.admin_compare_runs(uuid, uuid, uuid) to authenticated;

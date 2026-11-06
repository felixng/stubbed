create table public.crawl_sites (
  id uuid primary key default gen_random_uuid(),
  whats_on_url text not null unique,
  archive_url text,
  archive_status text not null default 'not_started' check (archive_status in ('not_started','in_progress','done')),
  health jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
create table public.crawl_rules (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.crawl_sites on delete cascade,
  rules jsonb not null check (jsonb_typeof(rules) = 'object'),
  author text not null,
  status text not null default 'proposed' check (status in ('proposed','active','retired')),
  created_at timestamptz not null default now()
);
create unique index crawl_rules_active on public.crawl_rules(site_id) where status = 'active';
alter table public.venues add column crawl_site_id uuid references public.crawl_sites on delete set null;
create index venues_crawl_site on public.venues(crawl_site_id);
create table public.crawl_pages (
  site_id uuid not null references public.crawl_sites on delete cascade,
  url text not null,
  type text not null check (type in ('whats_on','archive')),
  fingerprint text,
  etag text,
  last_modified text,
  last_read timestamptz,
  result_count integer not null default 0,
  failures integer not null default 0,
  status text not null default 'pending' check (status in ('pending','ok','failed','blocked')),
  next_url text,
  titles jsonb not null default '[]',
  readable_share numeric not null default 0,
  rule_id uuid references public.crawl_rules on delete set null,
  primary key(site_id,url)
);
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues on delete cascade,
  title text not null,
  title_key text generated always as (public.normalise_show_title(title)) stored,
  show_id uuid references public.shows on delete set null,
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  source text not null,
  source_url text not null,
  confidence numeric not null check (confidence between 0 and 1),
  last_seen_at timestamptz not null default now(),
  unique(venue_id,title_key,start_date)
);
create index runs_venue on public.runs(venue_id);
create index runs_dates on public.runs using gist(daterange(start_date,end_date,'[]'));
alter table public.crawl_findings add column page_checked boolean not null default false;
alter table public.crawl_findings add column rule_id uuid references public.crawl_rules on delete set null;
alter table public.crawl_findings drop constraint crawl_findings_method_check;
alter table public.crawl_findings add constraint crawl_findings_method_check check (method in ('stub','structured','model','rules'));

alter table public.crawl_sites enable row level security;
alter table public.crawl_rules enable row level security;
alter table public.crawl_pages enable row level security;
alter table public.runs enable row level security;
revoke all on public.crawl_sites, public.crawl_rules, public.crawl_pages, public.runs from anon, authenticated;
grant select on public.crawl_sites, public.crawl_rules, public.crawl_pages to authenticated;
grant select on public.runs to anon, authenticated;
grant all on public.crawl_sites, public.crawl_rules, public.crawl_pages, public.runs to service_role;
create policy "Admins read sites" on public.crawl_sites for select to authenticated using (public.is_admin());
create policy "Admins read rules" on public.crawl_rules for select to authenticated using (public.is_admin());
create policy "Admins read pages" on public.crawl_pages for select to authenticated using (public.is_admin());
create policy "Runs are public" on public.runs for select to anon, authenticated using (true);

-- The existing link editor still works; theatres sharing a URL share a site.
create function public.attach_crawl_site() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if nullif(btrim(new.whats_on_url),'') is null then new.crawl_site_id := null;
  else
    insert into public.crawl_sites(whats_on_url) values(btrim(new.whats_on_url)) on conflict(whats_on_url) do nothing;
    select id into new.crawl_site_id from public.crawl_sites where whats_on_url = btrim(new.whats_on_url);
  end if;
  return new;
end $$;
revoke execute on function public.attach_crawl_site() from public, anon, authenticated;
create trigger attach_crawl_site before insert or update of whats_on_url on public.venues for each row execute function public.attach_crawl_site();
update public.venues set whats_on_url = whats_on_url where whats_on_url is not null;

create function public.publish_crawl_findings(for_run uuid, manual boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if auth.role() is distinct from 'service_role' and session_user <> 'postgres' and not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  -- session_user is authenticator for API calls. A SET ROLE authenticated test
  -- still has postgres as session_user, so always enforce the active role too.
  if current_setting('role') in ('anon','authenticated') and not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into public.runs(venue_id,title,show_id,start_date,end_date,source,source_url,confidence,last_seen_at)
  select f.venue_id, f.raw_title,
    (select s.id from public.similar_shows(f.raw_title) s where s.same limit 1),
    f.start_date, f.end_date, f.method, f.source_url, f.confidence, now()
  from (select distinct on (f.venue_id, public.normalise_show_title(f.raw_title),f.start_date) f.*
    from public.crawl_findings f left join public.crawl_rules r on r.id = f.rule_id
    where f.run_id = for_run and f.page_checked and f.kind = 'show' and f.start_date is not null and f.venue_id is not null
      and f.review is distinct from 'wrong'
      and (f.method = 'structured' or (f.method = 'rules' and r.status = 'active') or (manual and f.method = 'model' and f.review = 'right'))
    order by f.venue_id, public.normalise_show_title(f.raw_title), f.start_date, f.confidence desc, f.created_at desc) f
  on conflict(venue_id,title_key,start_date) do update set
    show_id = coalesce(excluded.show_id,runs.show_id), end_date = excluded.end_date,
    source = excluded.source, source_url = excluded.source_url, confidence = excluded.confidence, last_seen_at = excluded.last_seen_at;
  get diagnostics changed = row_count;
  return changed;
end $$;
revoke execute on function public.publish_crawl_findings(uuid,boolean) from public, anon;
grant execute on function public.publish_crawl_findings(uuid,boolean) to service_role, authenticated;

create function public.admin_redo_archive(for_site uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  update public.crawl_sites set archive_status = 'not_started' where id = for_site;
  update public.crawl_pages set status = 'pending', fingerprint = null, etag = null, last_modified = null where site_id = for_site and type = 'archive';
end $$;
revoke execute on function public.admin_redo_archive(uuid) from public, anon;
grant execute on function public.admin_redo_archive(uuid) to authenticated;

create function public.admin_diary_crawl_score(venue_ids uuid[])
returns table(venue_id uuid, venue_name text, entry_id uuid, title text, on_date date, outcome text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query select e.venue_id, v.name, e.id, s.title, e.date,
    case when exists(select 1 from public.runs r where r.venue_id = e.venue_id and (r.show_id = e.show_id or r.title_key = public.normalise_show_title(s.title)) and e.date <@ daterange(r.start_date,r.end_date,'[]'))
      or exists(select 1 from public.crawl_findings f where f.venue_id = e.venue_id and f.page_checked and public.normalise_show_title(f.raw_title) = public.normalise_show_title(s.title) and f.start_date is not null and e.date <@ daterange(f.start_date,f.end_date,'[]')) then 'matching_dates'
    when exists(select 1 from public.runs r where r.venue_id = e.venue_id and (r.show_id = e.show_id or r.title_key = public.normalise_show_title(s.title)))
      or exists(select 1 from public.crawl_findings f where f.venue_id = e.venue_id and f.page_checked and public.normalise_show_title(f.raw_title) = public.normalise_show_title(s.title)) then 'wrong_dates'
    else 'missed' end
  from public.entries e join public.venues v on v.id = e.venue_id join public.shows s on s.id = e.show_id
  where e.user_id = auth.uid() and e.status = 'logged' and e.venue_id = any(venue_ids)
  order by v.name,e.date,s.title;
end $$;
revoke execute on function public.admin_diary_crawl_score(uuid[]) from public, anon;
grant execute on function public.admin_diary_crawl_score(uuid[]) to authenticated;

create or replace function public.merge_shows(from_id uuid, into_id uuid, force boolean default false)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  src public.shows;
  dst public.shows;
  moved_entries bigint;
  moved_runs bigint;
  moved_aliases bigint;
begin
  if from_id is null or into_id is null or from_id = into_id then
    raise exception 'merge_shows needs two different shows';
  end if;
  lock table public.shows in share row exclusive mode;
  lock table public.entries in share row exclusive mode;
  lock table public.show_aliases in share row exclusive mode;
  select * into src from public.shows s where s.id = from_id;
  select * into dst from public.shows s where s.id = into_id;
  if src.id is null or dst.id is null then
    raise exception 'merge_shows: show not found';
  end if;
  if src.type is distinct from dst.type and not force then
    raise exception 'merge_shows: types differ (% vs %); pass force to merge anyway', src.type, dst.type;
  end if;

  update public.entries e set show_id = into_id where e.show_id = from_id;
  get diagnostics moved_entries = row_count;
  update public.runs set show_id = into_id where show_id = from_id;
  get diagnostics moved_runs = row_count;
  insert into public.show_aliases (show_id, alias, created_by, created_at)
  select into_id, a.alias, a.created_by, a.created_at
  from public.show_aliases a where a.show_id = from_id
  on conflict (show_id, search_text) do nothing;
  get diagnostics moved_aliases = row_count;
  -- The deleted show's own aliases cascade.
  delete from public.shows s where s.id = from_id;
  return jsonb_build_object('entries', moved_entries, 'aliases', moved_aliases);
end;
$$;

create or replace function public.merge_venues(from_id uuid, into_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  src public.venues;
  dst public.venues;
  moved_entries bigint;
  moved_runs bigint;
begin
  if from_id is null or into_id is null or from_id = into_id then
    raise exception 'merge_venues needs two different venues';
  end if;
  lock table public.venues in share row exclusive mode;
  lock table public.entries in share row exclusive mode;
  select * into src from public.venues v where v.id = from_id;
  select * into dst from public.venues v where v.id = into_id;
  if src.id is null or dst.id is null then
    raise exception 'merge_venues: venue not found';
  end if;

  update public.entries e set venue_id = into_id where e.venue_id = from_id;
  get diagnostics moved_entries = row_count;
  lock table public.runs in share row exclusive mode;
  insert into public.runs(venue_id,title,show_id,start_date,end_date,source,source_url,confidence,last_seen_at)
  select into_id,title,show_id,start_date,end_date,source,source_url,confidence,last_seen_at from public.runs where venue_id = from_id
  on conflict(venue_id,title_key,start_date) do update set show_id = coalesce(runs.show_id,excluded.show_id), last_seen_at = greatest(runs.last_seen_at,excluded.last_seen_at);
  get diagnostics moved_runs = row_count;
  delete from public.runs where venue_id = from_id;
  -- Keep what the surviving venue lacks.
  update public.venues v set
    lat = coalesce(v.lat, src.lat), lng = coalesce(v.lng, src.lng),
    city = coalesce(v.city, src.city), country = coalesce(v.country, src.country)
  where v.id = into_id;
  delete from public.venues v where v.id = from_id;
  return jsonb_build_object('entries', moved_entries);
end;
$$;


-- Hand-authored Almeida rules; venues attach when their existing link is set.
insert into public.crawl_sites(whats_on_url,archive_url) values('https://almeida.co.uk/whats-on/','https://almeida.co.uk/past-productions/') on conflict do nothing;
insert into public.crawl_rules(site_id,rules,author,status)
select id,'{"item":".c-event-card","title":".c-event-card__title","dates":".c-event-card__daterange","link":".c-event-card__permalink","next":"a.next.page-numbers"}', 'hand: #388', 'active'
from public.crawl_sites where whats_on_url = 'https://almeida.co.uk/whats-on/';
alter table public.crawl_findings add column fetched_url text;

-- Paste a link into Backstage (#563, epic #562). Each link an admin pastes is a request; later steps read it.
-- A request starts as 'new' and only the crawler (service role) moves it on.

create table public.crawl_link_requests (
  id uuid primary key default gen_random_uuid(),
  url text not null check (char_length(url) <= 2048),
  host text not null,
  requested_by uuid references auth.users (id) on delete set null,
  status text not null default 'new' check (status in ('new', 'working', 'done', 'unsupported', 'failed')),
  kind text check (kind in ('venue_directory', 'show_directory', 'show_page', 'unsupported')),
  result jsonb not null default '{}'::jsonb,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crawl_link_requests_created on public.crawl_link_requests (created_at desc);
create index crawl_link_requests_url on public.crawl_link_requests (url, created_at desc);
create index crawl_link_requests_requested_by on public.crawl_link_requests (requested_by);
create index crawl_link_requests_open on public.crawl_link_requests (created_at) where status in ('new', 'working');
alter table public.crawl_link_requests enable row level security;
revoke all on public.crawl_link_requests from public, anon, authenticated;
grant select on public.crawl_link_requests to authenticated;
grant select, insert, update on public.crawl_link_requests to service_role;
create policy "Admins read crawl link requests" on public.crawl_link_requests for select to authenticated using (public.is_admin());

-- The link an admin pasted, cleaned: http(s) only, no credentials or port, a real public-looking host, no fragment
-- and no tracking parameters. The crawler checks the address again when it fetches the page.
create function public.admin_add_crawl_link(link text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  trimmed text := btrim(coalesce(link, ''));
  parts text[];
  host text;
  base text;
  query text;
  clean text;
  existing uuid;
  created uuid;
begin
  if not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if char_length(trimmed) > 2048 then raise exception 'That link is too long' using errcode = '22023'; end if;
  parts := regexp_match(trimmed, '^(https?)://([^/?#]+)([^?#]*)(?:\?([^#]*))?(?:#.*)?$', 'i');
  if parts is null then raise exception 'Paste a full link that starts with http:// or https://' using errcode = '22023'; end if;
  host := lower(parts[2]);
  if host ~ '[@:\[\]]' then raise exception 'That link has a login, port or address we do not read' using errcode = '22023'; end if;
  if host !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
     or host ~ '^[0-9.]+$' or host ~ '(^|\.)(localhost|local|internal|localdomain|lan|home|corp)$' then
    raise exception 'That address is not a public website' using errcode = '22023';
  end if;
  base := lower(parts[1]) || '://' || host || case when parts[3] = '' then '/' else parts[3] end;
  query := (select string_agg(p, '&' order by ord) from unnest(string_to_array(coalesce(parts[4], ''), '&')) with ordinality as t(p, ord)
    where p <> '' and p !~* '^(utm_[^=]*|gclid|fbclid|msclkid)(=|$)');
  clean := base || case when query is null then '' else '?' || query end;
  if char_length(clean) > 2048 then raise exception 'That link is too long' using errcode = '22023'; end if;

  select id into existing from public.crawl_link_requests where url = clean and created_at > now() - interval '1 day' limit 1;
  if existing is not null then raise exception 'That link was already added in the last day' using errcode = '23505'; end if;

  insert into public.crawl_link_requests (url, host, requested_by) values (clean, host, auth.uid()) returning id into created;
  return created;
end;
$$;
revoke all on function public.admin_add_crawl_link(text) from public, anon;
grant execute on function public.admin_add_crawl_link(text) to authenticated;

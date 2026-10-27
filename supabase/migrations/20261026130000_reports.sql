-- Reporting (#176), as App Review guideline 1.2 asks of apps with user
-- content: anyone signed in can report a show (entry), a comment or a
-- profile; only admins read reports and act on them (hide the content, or
-- dismiss). Admins are marked in Supabase Auth: app_metadata.role = "admin"
-- (apps/web/src/lib/admin.ts).
--
-- A report names what it's about by type and id, without a foreign key, and
-- keeps a snapshot of the text and who wrote it, so the report still makes
-- sense once the content is edited or deleted.

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type  text not null check (target_type in ('entry', 'comment', 'profile')),
  target_id    uuid not null,
  target_owner uuid references public.profiles (id) on delete set null,
  snapshot     text,
  reason       text not null check (reason in ('spam', 'harassment', 'inappropriate', 'other')),
  note         text check (note is null or (note = btrim(note) and char_length(note) between 1 and 500)),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolution   text check (resolution in ('hidden', 'dismissed')),
  check ((resolved_at is null) = (resolution is null))
);

-- One open report per person per thing: reporting again does nothing new.
create unique index reports_open_once on public.reports (reporter_id, target_type, target_id)
  where resolved_at is null;
create index reports_open_idx on public.reports (created_at) where resolved_at is null;

alter table public.reports enable row level security;

revoke all on public.reports from anon, authenticated;
grant insert (reporter_id, target_type, target_id, reason, note) on public.reports to authenticated;
grant select on public.reports to authenticated;

create function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create policy "Users report as themselves"
  on public.reports for insert
  to authenticated
  with check (reporter_id = (select auth.uid()));

create policy "Admins read reports"
  on public.reports for select
  to authenticated
  using (public.is_admin());

-- Fill in who made the reported thing and what it said, and refuse reports
-- about something that doesn't exist, or about yourself.
create function public.fill_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
  text_ text;
begin
  if new.target_type = 'entry' then
    select e.user_id, concat_ws(' · ', s.title, e.note) into owner, text_
    from public.entries e join public.shows s on s.id = e.show_id
    where e.id = new.target_id;
  elsif new.target_type = 'comment' then
    select c.user_id, c.body into owner, text_ from public.entry_comments c where c.id = new.target_id;
  else
    select p.id, concat_ws(' · ', '@' || p.handle, p.display_name, p.bio) into owner, text_
    from public.profiles p where p.id = new.target_id;
  end if;
  if owner is null then
    raise exception 'Nothing to report' using errcode = 'P0002';
  end if;
  if owner = new.reporter_id then
    raise exception 'You can''t report yourself' using errcode = '22023';
  end if;
  new.target_owner := owner;
  new.snapshot := text_;
  new.created_at := now();
  new.resolved_at := null;
  new.resolution := null;
  return new;
end;
$$;

revoke execute on function public.fill_report() from public, anon, authenticated;

create trigger reports_fill
  before insert on public.reports
  for each row execute function public.fill_report();

-- An admin acts on a report: `hide` deletes a comment, makes an entry private
-- or makes a profile private; `dismiss` leaves it. Either way every open
-- report about the same thing is resolved with it.
create function public.resolve_report(report_id uuid, action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reports;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if action not in ('hide', 'dismiss') then
    raise exception 'Unknown action %', action using errcode = '22023';
  end if;
  select * into r from public.reports where id = report_id;
  if r.id is null then
    raise exception 'No such report' using errcode = 'P0002';
  end if;
  if action = 'hide' then
    if r.target_type = 'comment' then
      delete from public.entry_comments where id = r.target_id;
    elsif r.target_type = 'entry' then
      update public.entries set visibility = 'private' where id = r.target_id;
    else
      update public.profiles set is_private = true where id = r.target_id;
    end if;
  end if;
  update public.reports
  set resolved_at = now(), resolution = case action when 'hide' then 'hidden' else 'dismissed' end
  where target_type = r.target_type and target_id = r.target_id and resolved_at is null;
end;
$$;

revoke execute on function public.resolve_report(uuid, text) from public;
grant execute on function public.resolve_report(uuid, text) to authenticated;

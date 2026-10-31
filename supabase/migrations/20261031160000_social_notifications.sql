-- Shared social activity. Timing policy lives here, never in either client.
-- Runtime policy is service-owned; change via a reviewed data migration.
create table public.notification_policy (
  singleton boolean primary key default true check (singleton),
  like_group_window interval not null default interval '24 hours',
  like_push_delay interval not null default interval '5 minutes',
  push_expiry interval not null default interval '24 hours',
  inbox_retention interval not null default interval '90 days',
  retry_delays_seconds integer[] not null default array[60,300,900,3600,10800],
  lease_duration interval not null default interval '2 minutes',
  check (like_group_window > interval '0' and like_push_delay >= interval '0'
    and push_expiry > like_push_delay and inbox_retention >= push_expiry)
);
insert into public.notification_policy(singleton) values(true);
alter table public.notification_policy enable row level security;
revoke all on public.notification_policy from anon, authenticated;

create type public.notification_category as enum ('like','comment','follower','follow_request','follow_accepted');
create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade default auth.uid(),
  push_enabled boolean not null default true,
  previews boolean not null default false,
  quiet_start time,
  quiet_end time,
  time_zone text not null default 'UTC',
  check ((quiet_start is null) = (quiet_end is null)),
  check (quiet_start is null or quiet_start <> quiet_end)
);
create table public.notification_category_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  category public.notification_category not null,
  inbox boolean not null default true,
  push boolean not null default true,
  primary key(user_id,category)
);
alter table public.notification_preferences enable row level security;
alter table public.notification_category_preferences enable row level security;
create policy "Own notification preferences" on public.notification_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "Own category preferences" on public.notification_category_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on public.notification_preferences,public.notification_category_preferences to authenticated;
revoke all on public.notification_preferences,public.notification_category_preferences from anon;

create function public.validate_notification_timezone() returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.time_zone) then
    raise exception 'Unknown time zone' using errcode='23514';
  end if;
  return new;
end $$;
create trigger notification_timezone before insert or update on public.notification_preferences for each row execute function public.validate_notification_timezone();

create sequence public.notification_revision;
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  category public.notification_category not null,
  entry_id uuid references public.entries(id) on delete cascade,
  inbox_enabled boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default nextval('public.notification_revision'),
  read_revision bigint not null default 0
);
create index notifications_recipient on public.notifications(recipient_id,updated_at desc,id);
create table public.notification_events (
  source_key text primary key,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  comment_id uuid references public.entry_comments(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index notification_events_group on public.notification_events(notification_id);
alter table public.notifications enable row level security;
alter table public.notification_events enable row level security;
-- No client reads raw events/copy. The RPC checks live visibility and sources.
revoke all on public.notifications,public.notification_events from anon,authenticated;
revoke all on sequence public.notification_revision from anon,authenticated;

create function public.notification_event_visible(ev public.notification_events, n public.notifications)
returns boolean language sql stable security definer set search_path='' as $$
  select ev.actor_id <> n.recipient_id
    and not public.is_blocked_between(ev.actor_id,n.recipient_id)
    and case n.category
      when 'like' then exists (
        select 1 from public.entry_likes l join public.entries e on e.id=l.entry_id
        join public.profiles p on p.id=e.user_id
        where l.user_id=ev.actor_id and l.entry_id=n.entry_id and e.user_id=n.recipient_id
          and e.visibility='public' and e.status='logged'
          and (not p.is_private or exists(select 1 from public.follows f where f.follower_id=ev.actor_id and f.followee_id=p.id and f.status='accepted')))
      when 'comment' then exists (
        select 1 from public.entry_comments c join public.entries e on e.id=c.entry_id
        join public.profiles p on p.id=e.user_id
        where c.id=ev.comment_id and c.user_id=ev.actor_id and e.id=n.entry_id and e.user_id=n.recipient_id
          and e.visibility='public' and e.status='logged'
          and (not p.is_private or exists(select 1 from public.follows f where f.follower_id=ev.actor_id and f.followee_id=p.id and f.status='accepted')))
      when 'follow_request' then exists(select 1 from public.follows f where f.follower_id=ev.actor_id and f.followee_id=n.recipient_id and f.status='pending')
      when 'follower' then exists(select 1 from public.follows f where f.follower_id=ev.actor_id and f.followee_id=n.recipient_id and f.status='accepted')
      when 'follow_accepted' then exists(select 1 from public.follows f where f.follower_id=n.recipient_id and f.followee_id=ev.actor_id and f.status='accepted')
    end;
$$;
revoke all on function public.notification_event_visible(public.notification_events,public.notifications) from public,anon,authenticated;

-- The initial outbox is channel-neutral; the push slice adds destination jobs.
create table public.notification_outbox (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  revision bigint not null,
  available_at timestamptz not null,
  expires_at timestamptz not null,
  primary key(notification_id,revision)
);
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon,authenticated;

create function public.intake_notification(recipient uuid, actor uuid, kind public.notification_category, source text, entry uuid default null, comment uuid default null, allow_push boolean default true)
returns void language plpgsql security definer set search_path='' as $$
declare n public.notifications; pol public.notification_policy; in_app boolean; push_on boolean; ev public.notification_events;
begin
  if actor=recipient or public.is_blocked_between(actor,recipient) then return; end if;
  -- Serialize by recipient, including like grouping and source-key deduplication.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(recipient::text,0));
  if exists(select 1 from public.notification_events where source_key=source) then return; end if;
  select * into pol from public.notification_policy where singleton;
  select coalesce(p.inbox,true),coalesce(p.push,true) into in_app,push_on
    from (select 1) seed left join public.notification_category_preferences p on p.user_id=recipient and p.category=kind;
  if kind='like' then
    select * into n from public.notifications where recipient_id=recipient and category=kind and entry_id=entry
      and inbox_enabled=in_app and created_at > now()-pol.like_group_window order by created_at desc limit 1 for update;
  end if;
  if n.id is null then
    insert into public.notifications(recipient_id,category,entry_id,inbox_enabled) values(recipient,kind,entry,in_app) returning * into n;
  else
    update public.notifications set updated_at=now(),revision=nextval('public.notification_revision') where id=n.id returning * into n;
  end if;
  insert into public.notification_events(source_key,notification_id,actor_id,comment_id) values(source,n.id,actor,comment) returning * into ev;
  if not public.notification_event_visible(ev,n) then
    delete from public.notification_events where source_key=source;
    if not exists(select 1 from public.notification_events where notification_id=n.id) then delete from public.notifications where id=n.id; end if;
    return;
  end if;
  -- Inbox and outbox commit with the successful social action, even if push is
  -- currently unavailable. Preference snapshots prevent retroactive sends.
  if allow_push and push_on and coalesce((select push_enabled from public.notification_preferences where user_id=recipient),true) then
    insert into public.notification_outbox values(n.id,n.revision,now()+case when kind='like' then pol.like_push_delay else interval '0' end,now()+pol.push_expiry);
  end if;
end $$;
revoke all on function public.intake_notification(uuid,uuid,public.notification_category,text,uuid,uuid,boolean) from public,anon,authenticated;

create function public.capture_social_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
  if tg_table_name='entry_likes' then
    select user_id into owner_id from public.entries where id=new.entry_id;
    perform public.intake_notification(owner_id,new.user_id,'like','like:'||new.entry_id||':'||new.user_id,new.entry_id);
  elsif tg_table_name='entry_comments' then
    select user_id into owner_id from public.entries where id=new.entry_id;
    perform public.intake_notification(owner_id,new.user_id,'comment','comment:'||new.id,new.entry_id,new.id);
  elsif tg_op='INSERT' then
    perform public.intake_notification(new.followee_id,new.follower_id,
      case when new.status='pending' then 'follow_request'::public.notification_category else 'follower'::public.notification_category end,
      'follow:'||new.follower_id||':'||new.followee_id);
  elsif old.status='pending' and new.status='accepted' then
    -- A profile becoming public bulk-accepts requests. Keep inbox activity,
    -- but no push burst from that nested profile trigger.
    perform public.intake_notification(new.follower_id,new.followee_id,'follow_accepted',
      'accepted:'||new.follower_id||':'||new.followee_id,null,null,pg_trigger_depth()=1);
  end if;
  return new;
end $$;
revoke all on function public.capture_social_notification() from public,anon,authenticated;
create trigger notifications_likes after insert on public.entry_likes for each row execute function public.capture_social_notification();
create trigger notifications_comments after insert on public.entry_comments for each row execute function public.capture_social_notification();
create trigger notifications_follows after insert or update of status on public.follows for each row execute function public.capture_social_notification();

create function public.notification_inbox(before_time timestamptz default null, before_id uuid default null)
returns table(id uuid,category public.notification_category,updated_at timestamptz,revision bigint,unread boolean,actor_id uuid,handle text,display_name text,avatar_url text,actor_count integer,show_title text,entry_id uuid)
language sql stable security definer set search_path='' as $$
  select n.id,n.category,n.updated_at,n.revision,n.read_revision<n.revision,
    actor.id,actor.handle,actor.display_name,actor.avatar_url,actors.total,s.title,n.entry_id
  from public.notifications n
  cross join lateral (
    select count(distinct ev.actor_id)::integer total,
      (array_agg(ev.actor_id order by ev.created_at desc,ev.source_key))[1] latest
    from public.notification_events ev where ev.notification_id=n.id and public.notification_event_visible(ev,n)
  ) actors
  join public.profiles actor on actor.id=actors.latest
  left join public.entries e on e.id=n.entry_id left join public.shows s on s.id=e.show_id
  where n.recipient_id=auth.uid() and n.inbox_enabled and actors.total>0
    and n.created_at > now()-(select inbox_retention from public.notification_policy where singleton)
    and (before_time is null or (n.updated_at,n.id)<(before_time,before_id))
  order by n.updated_at desc,n.id desc limit 30;
$$;

create function public.notification_unread_count() returns integer language sql stable security definer set search_path='' as $$
 select count(*)::integer from public.notifications n where n.recipient_id=auth.uid() and n.inbox_enabled and n.read_revision<n.revision
   and n.created_at > now()-(select inbox_retention from public.notification_policy where singleton)
   and exists(select 1 from public.notification_events ev where ev.notification_id=n.id and public.notification_event_visible(ev,n));
$$;
create function public.notification_read(notification_id uuid, seen_revision bigint) returns void language sql security definer set search_path='' as $$
 update public.notifications set read_revision=greatest(read_revision,least(revision,seen_revision)) where id=notification_id and recipient_id=auth.uid();
$$;
-- The client sends the highest revision from the snapshot it has seen. New
-- activity after that snapshot cannot be accidentally marked read.
create function public.notification_read_all(seen_revision bigint default null) returns void language plpgsql security definer set search_path='' as $$
declare cutoff bigint;
begin
 select coalesce(seen_revision,max(revision),0) into cutoff from public.notifications where recipient_id=auth.uid();
 update public.notifications set read_revision=greatest(read_revision,least(revision,cutoff)) where recipient_id=auth.uid() and revision<=cutoff;
end $$;
revoke all on function public.notification_inbox(timestamptz,uuid),public.notification_unread_count(),public.notification_read(uuid,bigint),public.notification_read_all(bigint) from public,anon;
grant execute on function public.notification_inbox(timestamptz,uuid),public.notification_unread_count(),public.notification_read(uuid,bigint),public.notification_read_all(bigint) to authenticated;

create function public.notification_set_category(kind public.notification_category, channel text, enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or channel not in ('inbox','push') then raise exception 'Invalid category change' using errcode='22023'; end if;
 insert into public.notification_category_preferences(user_id,category,inbox,push)
 values(auth.uid(),kind,case when channel='inbox' then enabled else true end,case when channel='push' then enabled else true end)
 on conflict(user_id,category) do update set
 inbox=case when channel='inbox' then enabled else public.notification_category_preferences.inbox end,
 push=case when channel='push' then enabled else public.notification_category_preferences.push end;
end $$;
revoke all on function public.notification_set_category(public.notification_category,text,boolean) from public,anon;
grant execute on function public.notification_set_category(public.notification_category,text,boolean) to authenticated;

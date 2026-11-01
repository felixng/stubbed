-- Owner-directed simplification: OS controls permission, previews and quiet time.
-- Preserve category push choices, inbox/read state and queued delivery history.
-- This changes the settings API; publish matching clients with this migration.
create or replace function public.intake_notification(recipient uuid, actor uuid, kind public.notification_category, source text, entry uuid default null, comment uuid default null, allow_push boolean default true)
returns void language plpgsql security definer set search_path='' as $$
declare n public.notifications; pol public.notification_policy; push_on boolean; ev public.notification_events;
begin
  if actor=recipient or public.is_blocked_between(actor,recipient) then return; end if;
  -- Serialize by recipient, including like grouping and source-key deduplication.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(recipient::text,0));
  if exists(select 1 from public.notification_events where source_key=source) then return; end if;
  select * into pol from public.notification_policy where singleton;
  select coalesce(p.push,true) into push_on
    from (select 1) seed left join public.notification_category_preferences p on p.user_id=recipient and p.category=kind;
  if kind='like' then
    select * into n from public.notifications where recipient_id=recipient and category=kind and entry_id=entry
      and created_at > now()-pol.like_group_window order by created_at desc limit 1 for update;
  end if;
  if n.id is null then
    insert into public.notifications(recipient_id,category,entry_id) values(recipient,kind,entry) returning * into n;
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
  if allow_push and push_on then
    insert into public.notification_outbox(notification_id,revision,available_at,expires_at,actor_id,source_key) values(n.id,n.revision,now()+case when kind='like' then pol.like_push_delay else interval '0' end,now()+pol.push_expiry,actor,source);
  end if;
end $$;

create or replace function public.notification_push_eligible(n public.notifications) returns boolean
language sql stable security definer set search_path='' as $$
 select n.read_revision<n.revision
 and coalesce((select push from public.notification_category_preferences where user_id=n.recipient_id and category=n.category),true)
 and exists(select 1 from public.notification_events ev where ev.notification_id=n.id and public.notification_event_visible(ev,n));
$$;

create or replace function public.prepare_notification_job(job uuid, lease_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.notification_deliveries; n public.notifications; d public.push_destinations; actor public.profiles; total integer; title text; body text;
begin
 select * into j from public.notification_deliveries where id=job and lease=lease_token and status='leased' and lease_until>now() and expires_at>now();
 if not found then return null; end if;
 select * into n from public.notifications where id=j.notification_id;
 select * into d from public.push_destinations where id=j.destination_id;
 if n.id is null or j.revision<=n.read_revision or j.revision<>public.notification_latest_push_revision(n.id) or d.user_id<>n.recipient_id or not public.notification_push_eligible(n) or not exists(select 1 from public.notification_outbox q where q.notification_id=n.id and q.revision=j.revision and public.notification_queued_source_visible(q)) then
  update public.notification_deliveries set status='cancelled',outcome='ineligible' where id=job and lease=lease_token;
  return null;
 end if;
 select p.* into actor from public.notification_events ev join public.profiles p on p.id=ev.actor_id
 where ev.notification_id=n.id and public.notification_event_visible(ev,n) and exists(select 1 from public.notification_outbox intent where intent.notification_id=n.id and intent.source_key=ev.source_key and intent.revision<=j.revision and intent.expires_at>now()) order by ev.created_at desc,ev.source_key limit 1;
 select count(distinct ev.actor_id)::integer into total from public.notification_events ev where ev.notification_id=n.id and public.notification_event_visible(ev,n) and exists(select 1 from public.notification_outbox intent where intent.notification_id=n.id and intent.source_key=ev.source_key and intent.revision<=j.revision and intent.expires_at>now());
 select s.title into title from public.entries e join public.shows s on s.id=e.show_id where e.id=n.entry_id;
 body := coalesce(nullif(actor.display_name,''),'@'||actor.handle)||case n.category
  when 'like' then case when total>1 then ' and '||(total-1)||' others' else '' end||' liked your '||coalesce(title,'show')||' diary entry'
  when 'comment' then ' commented on your '||coalesce(title,'show')||' diary entry'
  when 'follower' then ' started following you'
  when 'follow_request' then ' requested to follow you'
  when 'follow_accepted' then ' accepted your follow request' end;
 return jsonb_build_object('kind',d.kind,'token',d.native_token,'environment',d.apns_environment,
  'subscription',case when d.kind='web' then jsonb_build_object('endpoint',d.web_endpoint,'keys',jsonb_build_object('p256dh',d.web_p256dh,'auth',d.web_auth)) end,
  'notification',jsonb_build_object('id',n.id,'recipient_id',n.recipient_id,'title','Stubbed','body',body,'url','/app/notifications/open/'||n.id),
  'expires_at',j.expires_at,'collapse_key',n.id);
end $$;

create or replace function public.notification_inbox(before_time timestamptz default null, before_id uuid default null)
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
  where n.recipient_id=auth.uid() and actors.total>0
    and n.created_at > now()-(select inbox_retention from public.notification_policy where singleton)
    and (before_time is null or (n.updated_at,n.id)<(before_time,before_id))
  order by n.updated_at desc,n.id desc limit 30;
$$;

create or replace function public.notification_unread_count() returns integer language sql stable security definer set search_path='' as $$
 select count(*)::integer from public.notifications n where n.recipient_id=auth.uid() and n.read_revision<n.revision
   and n.created_at > now()-(select inbox_retention from public.notification_policy where singleton)
   and exists(select 1 from public.notification_events ev where ev.notification_id=n.id and public.notification_event_visible(ev,n));
$$;

drop function public.notification_set_category(public.notification_category,text,boolean);
create function public.notification_set_category(kind public.notification_category, enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 insert into public.notification_category_preferences(user_id,category,push) values(auth.uid(),kind,enabled)
 on conflict(user_id,category) do update set push=excluded.push;
end $$;
revoke all on function public.notification_set_category(public.notification_category,boolean) from public,anon;
grant execute on function public.notification_set_category(public.notification_category,boolean) to authenticated;

drop function public.notification_set_general(text,jsonb);
drop table public.notification_preferences;
drop function public.validate_notification_timezone();
alter table public.notification_category_preferences drop column inbox;
alter table public.notifications drop column inbox_enabled;
notify pgrst,'reload schema';

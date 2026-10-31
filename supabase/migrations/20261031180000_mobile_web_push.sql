-- Only explicitly mobile registrations are accepted. Client capability checks
-- never request desktop permission or create a desktop subscription.
create function public.register_browser_push(installation uuid, secret uuid, endpoint text, p256dh text, auth_key text, platform text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or platform is null or platform not in ('ios_home_screen','android')
  or length(endpoint)>4096 or endpoint !~ '^https://(fcm[.]googleapis[.]com|web[.]push[.]apple[.]com|updates[.]push[.]services[.]mozilla[.]com)/[^[:space:]#]+$'
  or length(rtrim(p256dh,'='))<>87 or p256dh !~ '^[A-Za-z0-9_-]+={0,2}$'
  or length(rtrim(auth_key,'='))<>22 or auth_key !~ '^[A-Za-z0-9_-]+={0,2}$'
 then raise exception 'Unsupported browser subscription' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(installation::text,0));
 if exists(select 1 from public.push_destinations where id=installation and secret_hash<>extensions.digest(secret::text,'sha256')) then raise exception 'Invalid installation' using errcode='42501'; end if;
 delete from public.push_destinations where web_endpoint=endpoint and id<>installation;
 insert into public.push_destinations(id,user_id,secret_hash,kind,web_endpoint,web_p256dh,web_auth)
 values(installation,auth.uid(),extensions.digest(secret::text,'sha256'),'web',endpoint,p256dh,auth_key)
 on conflict(id) do update set user_id=auth.uid(),web_endpoint=endpoint,web_p256dh=p256dh,web_auth=auth_key,updated_at=now();
end $$;
-- An expiry event for an old endpoint cannot remove its replacement.
create function public.remove_browser_push(installation uuid, secret uuid, endpoint text)
returns void language sql security definer set search_path='' as $$
 delete from public.push_destinations where id=installation and kind='web' and web_endpoint=endpoint and secret_hash=extensions.digest(secret::text,'sha256');
$$;
revoke all on function public.register_browser_push(uuid,uuid,text,text,text,text),public.remove_browser_push(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.register_browser_push(uuid,uuid,text,text,text,text) to authenticated;
grant execute on function public.remove_browser_push(uuid,uuid,text) to anon,authenticated;


-- Integration: source replay identity must not hide a genuinely new action.
-- UUID generations distinguish delete/reinsert even within one transaction.
alter table public.entry_likes add column notification_generation uuid not null default gen_random_uuid();
alter table public.follows add column notification_generation uuid not null default gen_random_uuid();
alter table public.notification_policy add column repeat_push_cooldown interval not null default interval '24 hours'
 check(repeat_push_cooldown>=interval '0' and repeat_push_cooldown<=inbox_retention);
alter table public.notification_outbox add column actor_id uuid references public.profiles(id) on delete cascade;
alter table public.notification_outbox add column source_key text references public.notification_events(source_key) on delete cascade;
alter table public.notification_outbox add column queued_at timestamptz not null default now();
create index notification_outbox_actor_time on public.notification_outbox(actor_id,queued_at);
-- All functions retain their existing grants. No new client write permission
-- is granted for the source-generation columns.
create or replace function public.notification_event_visible(ev public.notification_events, n public.notifications)
returns boolean language sql stable security definer set search_path='' as $$
  select ev.actor_id <> n.recipient_id
    and not public.is_blocked_between(ev.actor_id,n.recipient_id)
    and case n.category
      when 'like' then exists (
        select 1 from public.entry_likes l join public.entries e on e.id=l.entry_id
        join public.profiles p on p.id=e.user_id
        where l.user_id=ev.actor_id and l.entry_id=n.entry_id and ev.source_key='like:'||l.entry_id||':'||l.user_id||':'||l.notification_generation and e.user_id=n.recipient_id
          and e.visibility='public' and e.status='logged'
          and (not p.is_private or exists(select 1 from public.follows f where f.follower_id=ev.actor_id and f.followee_id=p.id and f.status='accepted')))
      when 'comment' then exists (
        select 1 from public.entry_comments c join public.entries e on e.id=c.entry_id
        join public.profiles p on p.id=e.user_id
        where c.id=ev.comment_id and c.user_id=ev.actor_id and e.id=n.entry_id and e.user_id=n.recipient_id
          and e.visibility='public' and e.status='logged'
          and (not p.is_private or exists(select 1 from public.follows f where f.follower_id=ev.actor_id and f.followee_id=p.id and f.status='accepted')))
      when 'follow_request' then exists(select 1 from public.follows f where f.follower_id=ev.actor_id and f.followee_id=n.recipient_id and f.status='pending' and ev.source_key='follow:'||f.follower_id||':'||f.followee_id||':'||f.notification_generation)
      when 'follower' then exists(select 1 from public.follows f where f.follower_id=ev.actor_id and f.followee_id=n.recipient_id and f.status='accepted' and ev.source_key='follow:'||f.follower_id||':'||f.followee_id||':'||f.notification_generation)
      when 'follow_accepted' then exists(select 1 from public.follows f where f.follower_id=n.recipient_id and f.followee_id=ev.actor_id and f.status='accepted' and ev.source_key='accepted:'||f.follower_id||':'||f.followee_id||':'||f.notification_generation)
    end;
$$;

create or replace function public.capture_social_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
  if tg_table_name='entry_likes' then
    select user_id into owner_id from public.entries where id=new.entry_id;
    perform public.intake_notification(owner_id,new.user_id,'like','like:'||new.entry_id||':'||new.user_id||':'||new.notification_generation,new.entry_id);
  elsif tg_table_name='entry_comments' then
    select user_id into owner_id from public.entries where id=new.entry_id;
    perform public.intake_notification(owner_id,new.user_id,'comment','comment:'||new.id,new.entry_id,new.id);
  elsif tg_op='INSERT' then
    perform public.intake_notification(new.followee_id,new.follower_id,
      case when new.status='pending' then 'follow_request'::public.notification_category else 'follower'::public.notification_category end,
      'follow:'||new.follower_id||':'||new.followee_id||':'||new.notification_generation);
  elsif old.status='pending' and new.status='accepted' then
    -- A profile becoming public bulk-accepts requests. Keep inbox activity,
    -- but no push burst from that nested profile trigger.
    perform public.intake_notification(new.follower_id,new.followee_id,'follow_accepted',
      'accepted:'||new.follower_id||':'||new.followee_id||':'||new.notification_generation,null,null,pg_trigger_depth()=1);
  end if;
  return new;
end $$;

create or replace function public.intake_notification(recipient uuid, actor uuid, kind public.notification_category, source text, entry uuid default null, comment uuid default null, allow_push boolean default true)
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
    insert into public.notification_outbox(notification_id,revision,available_at,expires_at,actor_id,source_key) values(n.id,n.revision,now()+case when kind='like' then pol.like_push_delay else interval '0' end,now()+pol.push_expiry,actor,source);
  end if;
end $$;

create or replace function public.filter_notification_push_intake() returns trigger
language plpgsql security definer set search_path='' as $$
declare n public.notifications; cooldown interval;
begin
 select * into n from public.notifications where id=new.notification_id;
 if new.actor_id is null or not public.notification_push_eligible(n) then return null; end if;
 select repeat_push_cooldown into cooldown from public.notification_policy where singleton;
 -- New source generations remain unread/actionable. Rate limiting concerns
 -- outbound repeat like/relationship actions, never distinct comments.
 if n.category<>'comment' and exists(
   select 1 from public.notification_outbox o join public.notifications prior on prior.id=o.notification_id
   where prior.recipient_id=n.recipient_id and prior.category=n.category
    and prior.entry_id is not distinct from n.entry_id and o.actor_id=new.actor_id
    and o.queued_at>now()-cooldown
 ) then return null; end if;
 return new;
end $$;

create function public.notification_queued_source_visible(o public.notification_outbox) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.notification_events ev join public.notifications n on n.id=ev.notification_id
  where ev.source_key=o.source_key and ev.notification_id=o.notification_id and ev.actor_id=o.actor_id
    and public.notification_event_visible(ev,n));
$$;
revoke all on function public.notification_queued_source_visible(public.notification_outbox) from public,anon,authenticated;

create function public.notification_latest_push_revision(notification_id uuid) returns bigint
language sql stable security definer set search_path='' as $$
 select max(o.revision) from public.notification_outbox o where o.notification_id=notification_latest_push_revision.notification_id
  and o.expires_at>now() and public.notification_queued_source_visible(o);
$$;
revoke all on function public.notification_latest_push_revision(uuid) from public,anon,authenticated;

create or replace function public.claim_notification_jobs(batch_size integer default 3)
returns table(job_id uuid,lease_id uuid)
language plpgsql security definer set search_path='' as $$
declare pol public.notification_policy;
begin
 select * into pol from public.notification_policy where singleton;
 -- Expiry and retention are centrally configured. Bounded maintenance avoids
 -- an unbounded function invocation; repeated ticks drain the backlog.
 delete from public.notifications where id in(select id from public.notifications where created_at<now()-pol.inbox_retention limit 100);
 delete from public.notification_outbox where (notification_id,revision) in(select notification_id,revision from public.notification_outbox where expires_at<=now() and queued_at<=now()-pol.repeat_push_cooldown limit 100);
 insert into public.notification_deliveries(notification_id,revision,destination_id,available_at,expires_at)
 select o.notification_id,o.revision,d.id,o.available_at,o.expires_at
 from public.notification_outbox o join public.notifications n on n.id=o.notification_id and o.revision=public.notification_latest_push_revision(n.id)
 join public.push_destinations d on d.user_id=n.recipient_id and d.created_at<=o.queued_at
 where o.available_at<=now() and o.expires_at>now() and public.notification_queued_source_visible(o)
 and not exists(select 1 from public.notification_deliveries j where j.notification_id=o.notification_id and j.revision=o.revision and j.destination_id=d.id)
 order by o.available_at limit 100 on conflict do nothing;
 -- Quiet-hour/read/obsolete jobs are discarded, never delayed into a burst.
 update public.notification_deliveries j set status='cancelled',outcome=case
  when j.expires_at<=now() then 'expired'
  when j.revision<=n.read_revision then 'read'
  when not exists(select 1 from public.notification_outbox q where q.notification_id=n.id and q.revision=j.revision and public.notification_queued_source_visible(q)) then 'withdrawn'
  when not public.notification_push_eligible(n) then 'ineligible'
  else 'superseded' end
 from public.notifications n where n.id=j.notification_id and j.status in ('pending','leased')
   and j.available_at<=now() and (j.expires_at<=now() or (j.revision<=n.read_revision or j.revision<>public.notification_latest_push_revision(n.id)) or not public.notification_push_eligible(n) or not exists(select 1 from public.notification_outbox q where q.notification_id=n.id and q.revision=j.revision and public.notification_queued_source_visible(q)));
 -- A newer like can supersede a pending batch and then be withdrawn. Resume
 -- the earlier still-live intent, but never revive read/quiet/failed/sent jobs.
 update public.notification_deliveries j set status='pending',outcome=null,lease=null,lease_until=null
 from public.notifications n where n.id=j.notification_id and j.status='cancelled' and j.outcome='superseded'
  and j.revision=public.notification_latest_push_revision(n.id) and j.revision>n.read_revision
  and j.expires_at>now() and public.notification_push_eligible(n)
  and j.attempts<=cardinality(pol.retry_delays_seconds);
 update public.notification_deliveries set status='failed',outcome='attempts_exhausted' where status='leased' and lease_until<=now() and attempts>cardinality(pol.retry_delays_seconds);
 return query
 with ready as (
  select j.id from public.notification_deliveries j where j.expires_at>now()
   and ((j.status='pending' and j.available_at<=now()) or (j.status='leased' and j.lease_until<=now()))
   and j.attempts<=cardinality(pol.retry_delays_seconds)
  order by j.available_at for update skip locked limit greatest(1,least(batch_size,20))
 ) update public.notification_deliveries j set status='leased',lease=gen_random_uuid(),lease_until=now()+pol.lease_duration,attempts=j.attempts+1
 from ready where ready.id=j.id returning j.id,j.lease;
end $$;

create or replace function public.prepare_notification_job(job uuid, lease_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.notification_deliveries; n public.notifications; d public.push_destinations; actor public.profiles; total integer; title text; body text; target text; previews_on boolean;
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
 select coalesce(previews,false) into previews_on from public.notification_preferences where user_id=n.recipient_id;
 body := case when coalesce(previews_on,false) then coalesce(nullif(actor.display_name,''),'@'||actor.handle)||case n.category
  when 'like' then case when total>1 then ' and '||(total-1)||' others' else '' end||' liked your '||coalesce(title,'show')||' diary entry'
  when 'comment' then ' commented on your '||coalesce(title,'show')||' diary entry'
  when 'follower' then ' started following you'
  when 'follow_request' then ' requested to follow you'
  when 'follow_accepted' then ' accepted your follow request' end
 else 'You have new activity on Stubbed.' end;
 return jsonb_build_object('kind',d.kind,'token',d.native_token,'environment',d.apns_environment,
  'subscription',case when d.kind='web' then jsonb_build_object('endpoint',d.web_endpoint,'keys',jsonb_build_object('p256dh',d.web_p256dh,'auth',d.web_auth)) end,
  'notification',jsonb_build_object('id',n.id,'recipient_id',n.recipient_id,'title','Stubbed','body',body,'url','/app/notifications/open/'||n.id),
  'expires_at',j.expires_at,'collapse_key',n.id);
end $$;

create or replace function public.notification_read_all(seen_revision bigint default null) returns void
language sql security definer set search_path='' as $$
 with snapshot as materialized (
  select id,revision from public.notifications where recipient_id=auth.uid()
   and (seen_revision is null or revision<=seen_revision)
 )
 update public.notifications n set read_revision=greatest(n.read_revision,least(n.revision,snapshot.revision))
 from snapshot where n.id=snapshot.id and n.recipient_id=auth.uid();
$$;

notify pgrst, 'reload schema';

-- Delivery destinations are private installation state, not account settings.
create table public.push_destinations (
 id uuid primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 secret_hash bytea not null,
 kind text not null check(kind in ('apns','web')),
 native_token text,
 apns_environment text check(apns_environment in ('sandbox','production')),
 web_endpoint text,
 web_p256dh text,
 web_auth text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((kind='apns' and native_token is not null and apns_environment is not null and web_endpoint is null)
    or (kind='web' and web_endpoint is not null and web_p256dh is not null and web_auth is not null and native_token is null))
);
create unique index push_native_unique on public.push_destinations(native_token,apns_environment) where kind='apns';
create unique index push_web_unique on public.push_destinations(web_endpoint) where kind='web';
alter table public.push_destinations enable row level security;
revoke all on public.push_destinations from anon,authenticated;

create function public.register_native_push(installation uuid, secret uuid, token text, environment text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or (length(token) not between 64 and 512 or token !~ '^[a-f0-9]+$') or environment not in ('sandbox','production') then raise exception 'Invalid native registration' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(installation::text,0));
 if exists(select 1 from public.push_destinations where id=installation and secret_hash<>extensions.digest(secret::text,'sha256')) then raise exception 'Invalid installation' using errcode='42501'; end if;
 delete from public.push_destinations where native_token=token and apns_environment=environment and id<>installation;
 insert into public.push_destinations(id,user_id,secret_hash,kind,native_token,apns_environment)
 values(installation,auth.uid(),extensions.digest(secret::text,'sha256'),'apns',token,environment)
 on conflict(id) do update set user_id=auth.uid(),native_token=token,apns_environment=environment,updated_at=now();
end $$;

-- Possession of a random installation secret permits cleanup even after the
-- session expires. It cannot read notification data or register a destination.
create function public.remove_push_installation(installation uuid, secret uuid)
returns void language sql security definer set search_path='' as $$
 delete from public.push_destinations where id=installation and secret_hash=extensions.digest(secret::text,'sha256');
$$;
revoke all on function public.register_native_push(uuid,uuid,text,text),public.remove_push_installation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.register_native_push(uuid,uuid,text,text) to authenticated;
grant execute on function public.remove_push_installation(uuid,uuid) to anon,authenticated;

create table public.notification_deliveries (
 id uuid primary key default gen_random_uuid(),
 notification_id uuid not null,
 revision bigint not null,
 destination_id uuid not null references public.push_destinations(id) on delete cascade,
 available_at timestamptz not null,
 expires_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','leased','accepted','cancelled','failed')),
 attempts integer not null default 0,
 lease uuid,
 lease_until timestamptz,
 outcome text,
 unique(notification_id,revision,destination_id),
 foreign key(notification_id,revision) references public.notification_outbox(notification_id,revision) on delete cascade
);
create index notification_delivery_ready on public.notification_deliveries(available_at) where status in ('pending','leased');
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from anon,authenticated;

create function public.notification_push_eligible(n public.notifications) returns boolean
language sql stable security definer set search_path='' as $$
 select n.read_revision<n.revision
 and coalesce((select push_enabled from public.notification_preferences where user_id=n.recipient_id),true)
 and coalesce((select push from public.notification_category_preferences where user_id=n.recipient_id and category=n.category),true)
 and exists(select 1 from public.notification_events ev where ev.notification_id=n.id and public.notification_event_visible(ev,n))
 and not exists(
   select 1 from public.notification_preferences p
   cross join lateral(select (now() at time zone p.time_zone)::time t) local
   where p.user_id=n.recipient_id and p.quiet_start is not null
     and case when p.quiet_start<p.quiet_end then local.t>=p.quiet_start and local.t<p.quiet_end
       else local.t>=p.quiet_start or local.t<p.quiet_end end);
$$;
revoke all on function public.notification_push_eligible(public.notifications) from public,anon,authenticated;

create function public.claim_notification_jobs(batch_size integer default 3)
returns table(job_id uuid,lease_id uuid)
language plpgsql security definer set search_path='' as $$
declare pol public.notification_policy;
begin
 select * into pol from public.notification_policy where singleton;
 -- Expiry and retention are centrally configured. Bounded maintenance avoids
 -- an unbounded function invocation; repeated ticks drain the backlog.
 delete from public.notifications where id in(select id from public.notifications where created_at<now()-pol.inbox_retention limit 100);
 delete from public.notification_outbox where (notification_id,revision) in(select notification_id,revision from public.notification_outbox where expires_at<=now() limit 100);
 insert into public.notification_deliveries(notification_id,revision,destination_id,available_at,expires_at)
 select o.notification_id,o.revision,d.id,o.available_at,o.expires_at
 from public.notification_outbox o join public.notifications n on n.id=o.notification_id and n.revision=o.revision
 join public.push_destinations d on d.user_id=n.recipient_id and d.created_at<=n.updated_at
 where o.available_at<=now() and o.expires_at>now()
 and not exists(select 1 from public.notification_deliveries j where j.notification_id=o.notification_id and j.revision=o.revision and j.destination_id=d.id)
 order by o.available_at limit 100 on conflict do nothing;
 -- Quiet-hour/read/obsolete jobs are discarded, never delayed into a burst.
 update public.notification_deliveries j set status='cancelled',outcome='ineligible'
 from public.notifications n where n.id=j.notification_id and j.status in ('pending','leased')
   and j.available_at<=now() and (j.expires_at<=now() or j.revision<>n.revision or not public.notification_push_eligible(n));
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

-- Prepare immediately before each network call. Recheck account ownership,
-- read state, privacy, source existence and quiet hours after lease acquisition.
create function public.prepare_notification_job(job uuid, lease_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.notification_deliveries; n public.notifications; d public.push_destinations; actor public.profiles; total integer; title text; body text; target text; previews_on boolean;
begin
 select * into j from public.notification_deliveries where id=job and lease=lease_token and status='leased' and lease_until>now() and expires_at>now();
 if not found then return null; end if;
 select * into n from public.notifications where id=j.notification_id and revision=j.revision;
 select * into d from public.push_destinations where id=j.destination_id;
 if n.id is null or d.user_id<>n.recipient_id or not public.notification_push_eligible(n) then
  update public.notification_deliveries set status='cancelled',outcome='ineligible' where id=job and lease=lease_token;
  return null;
 end if;
 select p.* into actor from public.notification_events ev join public.profiles p on p.id=ev.actor_id
 where ev.notification_id=n.id and public.notification_event_visible(ev,n) order by ev.created_at desc,ev.source_key limit 1;
 select count(distinct ev.actor_id)::integer into total from public.notification_events ev where ev.notification_id=n.id and public.notification_event_visible(ev,n);
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

create function public.finish_notification_job(job uuid, lease_token uuid, result text)
returns void language plpgsql security definer set search_path='' as $$
declare j public.notification_deliveries; delays integer[];
begin
 if result not in ('accepted','retryable','invalid_destination','permanent') then raise exception 'Unknown delivery result' using errcode='22023'; end if;
 select * into j from public.notification_deliveries where id=job and lease=lease_token and status='leased' for update;
 if not found then return; end if;
 if result='invalid_destination' then
  -- Do not delete a refreshed destination in response to an old registration.
  delete from public.push_destinations where id=j.destination_id and updated_at<=j.lease_until-(select lease_duration from public.notification_policy where singleton);
  update public.notification_deliveries set status='failed',outcome=result where id=job;
  return;
 end if;
 select retry_delays_seconds into delays from public.notification_policy where singleton;
 update public.notification_deliveries set
  status=case when result='accepted' then 'accepted' when result='retryable' and j.attempts<=cardinality(delays) and now()+make_interval(secs=>delays[j.attempts])<j.expires_at then 'pending' else 'failed' end,
  available_at=case when result='retryable' and j.attempts<=cardinality(delays) then now()+make_interval(secs=>delays[j.attempts]) else available_at end,
  outcome=result,lease=null,lease_until=null where id=job;
end $$;

-- Push links resolve only under live recipient eligibility. Deleted/inaccessible
-- activity opens the neutral inbox instead. Sign-in redirects retain this URL.
create function public.notification_open(notification_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare n public.notifications; actor_handle text; destination text;
begin
 select * into n from public.notifications where id=notification_id and recipient_id=auth.uid();
 if n.id is null then return '/app/notifications'; end if;
 select p.handle into actor_handle from public.notification_events ev join public.profiles p on p.id=ev.actor_id
 where ev.notification_id=n.id and public.notification_event_visible(ev,n) order by ev.created_at desc limit 1;
 if actor_handle is null then return '/app/notifications'; end if;
 update public.notifications set read_revision=greatest(read_revision,least(revision,n.revision)) where id=n.id;
 return case when n.category='follow_request' then '/app/profile/requests'
 when n.entry_id is not null then '/e/'||n.entry_id||case when n.category='comment' then '#comments' else '' end
 else '/@'||actor_handle end;
end $$;
revoke all on function public.claim_notification_jobs(integer),public.prepare_notification_job(uuid,uuid),public.finish_notification_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_notification_jobs(integer),public.prepare_notification_job(uuid,uuid),public.finish_notification_job(uuid,uuid,text) to service_role;
revoke all on function public.notification_open(uuid) from public,anon;
grant execute on function public.notification_open(uuid) to authenticated;

create function public.notification_set_general(setting text, value jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 insert into public.notification_preferences(user_id) values(auth.uid()) on conflict do nothing;
 if setting='push_enabled' and jsonb_typeof(value)='boolean' then
  update public.notification_preferences set push_enabled=value::text::boolean where user_id=auth.uid();
 elsif setting='previews' and jsonb_typeof(value)='boolean' then
  update public.notification_preferences set previews=value::text::boolean where user_id=auth.uid();
 elsif setting='quiet_hours' and (value is null or value='null'::jsonb or jsonb_typeof(value)='object') then
  update public.notification_preferences set quiet_start=(value->>'start')::time,quiet_end=(value->>'end')::time,
   time_zone=coalesce(value->>'time_zone',time_zone) where user_id=auth.uid();
 else raise exception 'Invalid notification setting' using errcode='22023'; end if;
end $$;
revoke all on function public.notification_set_general(text,jsonb) from public,anon;
grant execute on function public.notification_set_general(text,jsonb) to authenticated;

-- Also suppress events originating during quiet hours, so a delayed like batch
-- cannot emerge just after the window ends.
create function public.filter_notification_push_intake() returns trigger
language plpgsql security definer set search_path='' as $$
declare n public.notifications;
begin
 select * into n from public.notifications where id=new.notification_id;
 if not public.notification_push_eligible(n) then return null; end if;
 return new;
end $$;
revoke all on function public.filter_notification_push_intake() from public,anon,authenticated;
create trigger notification_outbox_eligibility before insert on public.notification_outbox for each row execute function public.filter_notification_push_intake();

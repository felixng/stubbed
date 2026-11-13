begin;
select no_plan();

create function pg_temp.stage(kind text, path text, observation jsonb)
returns uuid language plpgsql as $$
declare
  generation uuid;
  task uuid;
  token uuid := gen_random_uuid();
begin
  generation := public.start_crawl_generation('london_theatre', 'identity-test', 'directory',
    'https://www.londontheatre.co.uk/venues');
  task := public.enqueue_crawl_task(generation, kind, 'https://www.londontheatre.co.uk/' || path);
  update public.crawl_tasks set status = 'leased', lease_owner = 'fixture',
    lease_token = token, lease_expires_at = now() + interval '5 minutes' where id = task;
  perform public.acknowledge_crawl_task(task, token, '1', repeat(md5(observation::text), 2), '[]',
    jsonb_build_array(observation));
  return task;
end;
$$;

create function pg_temp.venue(external text, label text, postcode text, extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('observation_kind', 'venue', 'external_key', external, 'name', label,
    'city', 'London', 'country', 'GB', 'postcode', postcode) || extra;
$$;

create function pg_temp.event(external text, title text, kind text, extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('observation_kind', 'event', 'external_key', external, 'raw_title', title,
    'event_kind', 'show', 'show_type', kind, 'venue', jsonb_build_object('external_key', 'royal'),
    'date_status', 'supported', 'dates', '[{"kind":"start","date":"2026-11-12"}]'::jsonb) || extra;
$$;

create function pg_temp.mapping(kind text, key text)
returns public.crawl_source_entities language sql as $$
  select m.* from public.crawl_source_entities m join public.crawl_sources s on s.id = m.source_id
  where s.source_key = 'london_theatre' and m.entity_kind = kind and m.external_key = key;
$$;

insert into public.venues (id, name, city, country, catalogue_postcode, catalogue_auditorium, catalogue_granularity)
values ('a5370000-0000-0000-0000-000000000001', 'Royal Theatre', 'London', 'GB', 'WC2R 0NS', null, 'venue');

set local role service_role;
update public.crawl_sources set collection_enabled = true, publication_enabled = true where source_key = 'london_theatre';
select pg_temp.stage('venue','venues/royal',pg_temp.venue('royal','Royal Theatre','WC2R 0NS'));
select pg_temp.stage('event','show/1-first',pg_temp.event('1','Unknown Stage Piece',null));
select is(public.publish_crawl_identities('london_theatre')->>'failed', '0', 'first publication processes');
select is((select title from public.show_candidates where id = (pg_temp.mapping('event','1')).candidate_id),
  'Unknown Stage Piece', 'a pending crawler candidate exists');

select pg_temp.stage('event','show/1-second',pg_temp.event('1','Unknown Stage Piece Reworked',null));
select is(public.publish_crawl_identities('london_theatre')->>'failed', '0',
  'a changed cleaned title updates the pending candidate without failing (#537)');
select is((select title from public.show_candidates where id = (pg_temp.mapping('event','1')).candidate_id),
  'Unknown Stage Piece Reworked', 'the candidate has the new cleaned title');

select * from finish();
rollback;

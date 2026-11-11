-- Adds the shows listed on a venue page (title, read status, dates) to the page results.
-- What each crawled page produced, for Backstage > Catalogue crawler. A page's
-- status says whether the fetch worked; this says what we got from it, so the
-- row can lead with the result and keep fetch details secondary.
-- Read-only, admin-only, at most 100 pages per call.
create or replace function public.admin_crawl_task_results(for_tasks uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if cardinality(for_tasks) > 100 then raise exception 'Ask for 100 pages or fewer' using errcode = '22023'; end if;
  return coalesce((
    with picked as (
      select id, stage from public.crawl_tasks where id = any(for_tasks)
    ), latest as (
      select distinct on (e.task_id) e.task_id, e.observations
      from public.crawl_extractions e join picked p on p.id = e.task_id
      order by e.task_id, e.extracted_at desc
    ), kids as (
      select ed.parent_id,
        count(distinct c.id) as total,
        count(distinct c.id) filter (where c.status = 'succeeded') as done,
        count(distinct c.id) filter (where c.status in ('failed', 'blocked', 'retry_wait')) as stuck
      from public.crawl_task_edges ed join picked p on p.id = ed.parent_id
      join public.crawl_tasks c on c.id = ed.child_id and c.stage = 'event'
      group by ed.parent_id
    )
    select jsonb_object_agg(p.id::text, jsonb_build_object('stage', p.stage) || case
      when l.task_id is null then '{}'::jsonb
      when p.stage = 'directory' then jsonb_build_object('venues_listed', jsonb_array_length(l.observations))
      when p.stage = 'venue' then coalesce((
        select jsonb_build_object(
          'name', v->>'name', 'street', v->>'street', 'city', v->>'city',
          'postcode', v->>'postcode', 'country', v->>'country',
          'located', (v->>'lat') is not null, 'located_by', v->'geocode'->>'provider',
          'shows_total', coalesce(k.total, 0), 'shows_read', coalesce(k.done, 0), 'shows_stuck', coalesce(k.stuck, 0),
          'shows', coalesce((
            select jsonb_agg(q.s order by q.s->>'title') from (
              select jsonb_build_object('title', coalesce(ev.raw_title, lab.label, c.canonical_url), 'status', c.status,
                'opens', ev.opens, 'closes', ev.closes, 'ends', ev.ends) as s
              from public.crawl_task_edges ed
              join public.crawl_tasks c on c.id = ed.child_id and c.stage = 'event'
              left join lateral (
                select x.observations from public.crawl_extractions x where x.task_id = c.id order by x.extracted_at desc limit 1
              ) cx on true
              left join lateral (
                select o->>'raw_title' as raw_title,
                  (select min(d->>'date') from jsonb_array_elements(coalesce(o->'dates', '[]'::jsonb)) d where d->>'kind' in ('opening', 'start')) as opens,
                  (select min(d->>'date') from jsonb_array_elements(coalesce(o->'dates', '[]'::jsonb)) d where d->>'kind' = 'closing') as closes,
                  (select max(d->>'date') from jsonb_array_elements(coalesce(o->'dates', '[]'::jsonb)) d where d->>'kind' = 'end') as ends
                from jsonb_array_elements(cx.observations) o where o->>'observation_kind' = 'event' limit 1
              ) ev on true
              left join lateral (
                select o->>'label' as label from jsonb_array_elements(l.observations) o
                where o->>'observation_kind' = 'event_link' and o->>'source_url' = c.canonical_url limit 1
              ) lab on true
              where ed.parent_id = p.id
              limit 50
            ) q), '[]'::jsonb))
        from jsonb_array_elements(l.observations) v where v->>'observation_kind' = 'venue' limit 1
      ), '{}'::jsonb)
      else coalesce((
        select jsonb_build_object(
          'title', ev->>'raw_title', 'show_type', ev->>'show_type', 'event_kind', ev->>'event_kind',
          'venue_name', ev#>>'{venue,name}',
          'dates', coalesce((select jsonb_agg(jsonb_build_object('date', d->>'date', 'kind', d->>'kind'))
            from jsonb_array_elements(coalesce(ev->'dates', '[]'::jsonb)) d), '[]'::jsonb))
        from jsonb_array_elements(l.observations) ev where ev->>'observation_kind' = 'event' limit 1
      ), '{}'::jsonb)
    end)
    from picked p left join latest l on l.task_id = p.id left join kids k on k.parent_id = p.id
  ), '{}'::jsonb);
end;
$$;
revoke all on function public.admin_crawl_task_results(uuid[]) from public, anon;
grant execute on function public.admin_crawl_task_results(uuid[]) to authenticated;

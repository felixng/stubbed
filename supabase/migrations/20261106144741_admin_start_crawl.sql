-- Session-bound admin entry point; no service key in Vercel.
create function public.admin_create_crawl_run(settings jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ids uuid[]; new_id uuid;
begin
  if not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if jsonb_typeof(settings->'venue_ids') is distinct from 'array' then raise exception 'Invalid theatres'; end if;
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(settings->'venue_ids');
  if coalesce(cardinality(ids), 0) not between 1 and 10
    or (select count(distinct v.id) from public.venues v where v.id = any(ids) and nullif(btrim(v.whats_on_url), '') is not null) <> cardinality(ids)
    then raise exception 'Choose 1–10 different theatres with links'; end if;
  if coalesce(settings->>'method', '') not in ('rules', 'rules_model')
    or coalesce(settings->>'model', '') not in ('claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5')
    or coalesce(settings->>'kind', '') not in ('whats_on', 'show_names')
    or coalesce(settings->>'branch', '') !~ '^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$'
    or settings->>'branch' like '%..%' or settings->>'branch' like '%/'
    or coalesce(char_length(settings->>'prompt'), 0) > 20000
    or jsonb_typeof(settings->'budget_usd') is distinct from 'number'
    then raise exception 'Invalid settings'; end if;
  if (settings->>'budget_usd')::numeric not between 0 and 10
    or (settings->>'method' = 'rules_model' and (settings->>'budget_usd')::numeric = 0)
    then raise exception 'Invalid budget'; end if;
  insert into public.crawl_runs(venue_ids, method, model, prompt, budget_usd, branch, kind, created_by)
    values(ids, settings->>'method', settings->>'model', settings->>'prompt', (settings->>'budget_usd')::numeric, settings->>'branch', settings->>'kind', auth.uid())
    returning id into new_id;
  return new_id;
end $$;
revoke execute on function public.admin_create_crawl_run(jsonb) from public, anon;
grant execute on function public.admin_create_crawl_run(jsonb) to authenticated;

create function public.admin_fail_crawl_dispatch(for_run uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  update public.crawl_runs set status = 'failed', finished_at = now(), summary = '{"error":"Workflow dispatch failed"}'
    where id = for_run and created_by = auth.uid() and status = 'queued';
end $$;
revoke execute on function public.admin_fail_crawl_dispatch(uuid) from public, anon;
grant execute on function public.admin_fail_crawl_dispatch(uuid) to authenticated;

alter table public.venues add column website_source text;
alter table public.venues add column whats_on_source text;
alter table public.venues add column crawl_attempt_at timestamptz;
alter table public.venues add column crawl_error text;
alter table public.venues add column crawl_attempts integer not null default 0;
update public.venues set website_source=case when website is not null then case when source='osm' then 'osm' else 'manual' end end,
  whats_on_source=case when whats_on_url is not null then 'manual' end;
alter table public.crawl_sites add column website_url text;
alter table public.crawl_sites add column link_source text;
alter table public.crawl_sites add column archive_source text;
update public.crawl_sites set archive_source='manual' where archive_url is not null;
alter table public.crawl_sites add column status text not null default 'pending' check(status in ('pending','ready','needs_attention'));
alter table public.crawl_sites add column reason text;
alter table public.crawl_sites add column repair_attempts integer not null default 0;
alter table public.crawl_sites add column last_crawled_at timestamptz;
alter table public.crawl_rules add column validation jsonb;
update public.crawl_rules set validation='{"checked":true,"source":"hand-authored fixture"}' where status='active';

-- Order and due checks are shared across every loop invocation. Privileged
-- counts only prioritise venues; no identity or diary content leaves SQL.
create function public.crawl_work(batch_size integer default 25) returns jsonb
language sql security definer set search_path = '' as $$
with ranked as (
 select v.id,v.name,v.city,v.country,v.website,v.wikidata_id,v.whats_on_url,v.crawl_site_id,v.website_source,v.whats_on_source,
   row_number() over(partition by coalesce(v.crawl_site_id,v.id) order by (select count(*) from public.entries e where e.venue_id=v.id) desc,v.id) as site_rank,
   (select count(*) from public.entries e where e.venue_id=v.id) as entry_count,
   v.circuit in ('west_end','broadway') as major
 from public.venues v left join public.crawl_sites s on s.id=v.crawl_site_id
 where v.crawl_attempts < 3 and (v.crawl_attempt_at is null or v.crawl_attempt_at < now()-interval '1 day')
   and (s.id is null or (s.status <> 'needs_attention' and (s.last_crawled_at is null or s.last_crawled_at < now()-interval '7 days' or s.archive_status <> 'done' or s.status <> 'ready')))
)
select coalesce(jsonb_agg(to_jsonb(x) - 'site_rank' order by x.entry_count desc,x.major desc nulls last,x.name), '[]'::jsonb)
from (select * from ranked where site_rank=1 order by entry_count desc,major desc nulls last,name limit least(greatest(batch_size,0),100)) x;
$$;
revoke execute on function public.crawl_work(integer) from public,anon,authenticated;
grant execute on function public.crawl_work(integer) to service_role;

create function public.admin_crawl_progress() returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'Not allowed' using errcode='42501';end if;
 return jsonb_build_object(
 'theatres',(select count(*) from public.venues),
 'website',(select count(*) from public.venues where website is not null),
 'link',(select count(*) from public.venues where whats_on_url is not null),
 'rules',(select count(*) from public.venues v where exists(select 1 from public.crawl_rules r where r.site_id=v.crawl_site_id and r.status='active')),
 'history_done',(select count(*) from public.venues v join public.crawl_sites s on s.id=v.crawl_site_id where s.archive_status='done'),
 'needs_attention',(select count(*) from public.venues v left join public.crawl_sites s on s.id=v.crawl_site_id where s.status='needs_attention' or v.crawl_error is not null),
 'runs',(select count(*) from public.runs),
 'spend_usd',(select coalesce(sum(cost_usd),0) from public.crawl_runs));
end $$;
revoke execute on function public.admin_crawl_progress() from public,anon;
grant execute on function public.admin_crawl_progress() to authenticated;

create function public.admin_crawl_rule_action(rule_id uuid,action text) returns void language plpgsql security definer set search_path = '' as $$
declare site uuid;
begin
 if not public.is_admin() then raise exception 'Not allowed' using errcode='42501';end if;
 if action not in ('retire','restore') then raise exception 'Invalid action';end if;
 select site_id into site from public.crawl_rules where id=rule_id;
 if site is null then raise exception 'Rule not found';end if;
 -- A restored version is proposed again: the next loop must test it against
 -- the current page and known shows before activating it, without AI.
 update public.crawl_rules set status=case when action='retire' then 'retired' else 'proposed' end, validation=case when action='restore' then coalesce(validation,'{}'::jsonb)||'{"restore_requested":true}'::jsonb else validation end where id=rule_id;
 update public.crawl_sites set status='pending',repair_attempts=0,reason=null where id=site;
 update public.venues set crawl_attempt_at=null,crawl_attempts=0 where crawl_site_id=site;
end $$;
revoke execute on function public.admin_crawl_rule_action(uuid,text) from public,anon;
grant execute on function public.admin_crawl_rule_action(uuid,text) to authenticated;

create function public.admin_retry_crawl_site(for_site uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'Not allowed' using errcode='42501';end if;
 update public.crawl_sites set status='pending',repair_attempts=0,reason=null where id=for_site;
 update public.venues set crawl_attempt_at=null,crawl_attempts=0,crawl_error=null where crawl_site_id=for_site;
end $$;
revoke execute on function public.admin_retry_crawl_site(uuid) from public,anon;
grant execute on function public.admin_retry_crawl_site(uuid) to authenticated;

-- Extend the existing admin edit without changing its signature.
create or replace function public.admin_update_venue(venue_id uuid,new_website text,new_whats_on_url text,new_circuit text)
returns void language plpgsql security definer set search_path = '' as $$
declare site text:=nullif(btrim(new_website),''); link text:=nullif(btrim(new_whats_on_url),''); circ public.venue_circuit;
begin
 if not public.is_admin() then raise exception 'Admins only' using errcode='42501';end if;
 if site is not null and (site !~* '^https?://' or char_length(site)>500) then raise exception 'The website must start with http:// or https:// and be at most 500 characters' using errcode='22023';end if;
 if link is not null and (link !~* '^https?://' or char_length(link)>500) then raise exception 'The what''s-on link must start with http:// or https:// and be at most 500 characters' using errcode='22023';end if;
 if nullif(btrim(new_circuit),'') is not null then
  begin circ:=btrim(new_circuit)::public.venue_circuit;exception when invalid_text_representation then raise exception 'Unknown circuit %',new_circuit using errcode='22023';end;
 end if;
 update public.venues v set website_source=case when v.website is distinct from site then case when site is null then null else 'manual' end else v.website_source end,
   whats_on_source=case when v.whats_on_url is distinct from link then case when link is null then null else 'manual' end else v.whats_on_source end,
   website=site,whats_on_url=link,circuit=circ,crawl_error=null,crawl_attempts=0,crawl_attempt_at=null
 where v.id=venue_id;
 if not found then raise exception 'No such theatre' using errcode='P0002';end if;
end $$;

create function public.admin_list_crawl_venues(
  q            text    default null,
  in_circuit   text    default null,  -- a venue_circuit, or 'none' for unlabelled
  in_country   text    default null,
  has_website  boolean default null,
  has_whats_on boolean default null,
  page_size    integer default 50,
  page_offset  integer default 0,
  only_attention boolean default false
)
returns table (
  id           uuid,
  name         text,
  city         text,
  country      text,
  circuit      public.venue_circuit,
  website      text,
  whats_on_url text,
  entry_count  bigint,
  website_source text,
  whats_on_source text,
  crawl_error text,
  site_status text
)
language plpgsql stable security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  nq text := public.normalise_search_text(q);
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
  select v.id, v.name, v.city, v.country, v.circuit, v.website, v.whats_on_url,
         coalesce(c.n, 0)::bigint as entry_count, v.website_source, v.whats_on_source, coalesce(v.crawl_error,s.reason), s.status
  from public.venues v
  left join public.crawl_sites s on s.id=v.crawl_site_id
  left join (select e.venue_id, count(*) as n from public.entries e
             where e.venue_id is not null group by e.venue_id) c on c.venue_id = v.id
  where (nq is null or nq = '' or v.search_text like '%' || nq || '%'
         or (v.city is not null and public.normalise_search_text(v.city) like '%' || nq || '%'))
    and (in_circuit is null or (in_circuit = 'none' and v.circuit is null) or v.circuit::text = in_circuit)
    and (in_country is null or v.country = in_country)
    and (has_website is null or (v.website is not null) = has_website)
    and (has_whats_on is null or (v.whats_on_url is not null) = has_whats_on)
    and (not only_attention or v.crawl_error is not null or s.status='needs_attention')
  order by coalesce(c.n, 0) desc, v.name, v.id
  limit least(greatest(page_size, 1), 200)
  offset greatest(page_offset, 0);
end;
$$;


revoke execute on function public.admin_list_crawl_venues(text,text,text,boolean,boolean,integer,integer,boolean) from public,anon;
grant execute on function public.admin_list_crawl_venues(text,text,text,boolean,boolean,integer,integer,boolean) to authenticated;

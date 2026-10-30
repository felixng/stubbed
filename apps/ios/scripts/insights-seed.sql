-- Synthetic diary for InsightsUITests only; the normal test fixture is unchanged.
-- Runs locally after test-seed.sql, never against the hosted project.
insert into public.venues(id,name,city,country,lat,lng) values
 ('00000000-0000-4000-e300-000000000001','Insight London','London','United Kingdom',51.51,-0.12),
 ('00000000-0000-4000-e300-000000000002','Insight Paris','Paris','France',48.86,2.35),
 ('00000000-0000-4000-e300-000000000003','Insight New York','New York','United States',40.76,-73.98)
on conflict(id) do nothing;
insert into public.shows(id,title,type)
select ('00000000-0000-4000-e400-' || lpad(i::text,12,'0'))::uuid,
       (array['A musical evening','A new play','Stand-up live','An opera','Dance programme','A comedy','A discovery'])[i],
       (array['musical','play','standup','opera','dance','comedy','other'])[i]::public.show_type
from generate_series(1,7) i on conflict(id) do nothing;
delete from public.entries where id::text like '00000000-0000-4000-e500-%';
insert into public.entries(id,user_id,show_id,venue_id,date,status,visibility,rating)
select ('00000000-0000-4000-e500-' || lpad(i::text,12,'0'))::uuid,
       (select id from public.profiles where handle='ios_test'),
       ('00000000-0000-4000-e400-' || lpad((1 + i % 7)::text,12,'0'))::uuid,
       case when i % 10 = 0 then null else
         ('00000000-0000-4000-e300-' || lpad((1 + i % 3)::text,12,'0'))::uuid end,
       case when i <= 35 then current_date - ((i - 1) * 6) else
         make_date(extract(year from current_date)::integer - 1,1,1) + (i - 36) * 12 end,
       'logged', case when i % 3=0 then 'private'::public.visibility else 'public'::public.visibility end,
       3.5 + (i % 4) * 0.5
from generate_series(1,60) i;

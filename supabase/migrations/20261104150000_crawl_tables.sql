-- Crawl pilot (#277): every attempt to read what's on from a theatre's own
-- website, kept so runs can be compared. Admin read only; written by the crawl
-- script with the service role. Nothing here reaches users or show search:
-- findings keep the raw title and link to no show.

create table public.crawl_runs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'whats_on' check (kind in ('whats_on', 'show_names')),
  status      text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  venue_ids   uuid[] not null default '{}',
  method      text not null default 'rules' check (method in ('rules', 'rules_model')),
  model       text,
  prompt      text,
  branch      text,
  commit_sha  text,
  budget_usd  numeric(8,2) not null default 0 check (budget_usd >= 0),
  cost_usd    numeric(8,4) not null default 0 check (cost_usd >= 0),
  log_url     text,
  summary     jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz
);

create table public.crawl_findings (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.crawl_runs (id) on delete cascade,
  venue_id    uuid references public.venues (id) on delete set null,
  source_url  text not null check (char_length(source_url) <= 500),
  raw_title   text not null check (char_length(raw_title) <= 300),
  stage_text  text check (char_length(stage_text) <= 200),
  start_date  date,
  end_date    date check (end_date is null or start_date is null or end_date >= start_date),
  date_text   text check (char_length(date_text) <= 200),
  kind        text not null default 'show' check (kind in ('show', 'talk', 'concert', 'other')),
  method      text not null check (method in ('stub', 'structured', 'model')),
  confidence  numeric(3,2) not null default 0 check (confidence between 0 and 1),
  evidence    text check (char_length(evidence) <= 400),
  review      text check (review in ('right', 'wrong', 'unsure')),
  review_note text check (char_length(review_note) <= 500),
  created_at  timestamptz not null default now()
);

create index crawl_findings_run on public.crawl_findings (run_id);
create index crawl_findings_venue on public.crawl_findings (venue_id);
create index crawl_runs_created_by on public.crawl_runs (created_by);
create index crawl_runs_created_at on public.crawl_runs (created_at desc);

alter table public.crawl_runs enable row level security;
alter table public.crawl_findings enable row level security;

revoke all on public.crawl_runs, public.crawl_findings from anon, authenticated;
grant select on public.crawl_runs, public.crawl_findings to authenticated;

create policy "Admins read crawl runs"
  on public.crawl_runs for select
  to authenticated
  using (public.is_admin());

create policy "Admins read crawl findings"
  on public.crawl_findings for select
  to authenticated
  using (public.is_admin());

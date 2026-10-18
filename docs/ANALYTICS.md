# Analytics

Three parts, all free (see `docs/DECISIONS.md`, "Basic analytics"):

| What | Where | Covers |
|---|---|---|
| Page traffic | **Vercel Web Analytics** (`@vercel/analytics`, `SiteAnalytics`) | Visitors, page views, referrers, countries, devices for public pages: the landing page, legal pages and public profiles (`/@handle`). `/app`, `/login`, `/auth` and `/welcome` are excluded. Cookieless, so no consent banner. |
| Page traffic, second view | **Google Analytics 4** (`SiteAnalytics`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`) | The same public pages, same exclusions. Consent Mode stays at `denied`, so no cookies and no banner; Google gets cookieless pings only (see below). |
| Product events | **Supabase `events` table** (`track()` in `apps/web/src/lib/analytics.ts`) | Things signed-in people do in the app, recorded the same way from web and (later) iOS. |

Anything the database already records is counted from its own table, not duplicated as an event: entries (`entries.created_at`), trips (`collections`), waitlist sign-ups and where they came from (`waitlist.source`).

## Setup

1. Vercel → the project → **Analytics** → **Enable** (Web Analytics; the Hobby plan is free, ~50k events a month). Nothing is sent until this is on, and nothing is sent from local dev.
2. Google Analytics: create a GA4 property for Stubbed at analytics.google.com (Admin → Create → Property, then a **Web** data stream for the production domain). Copy the stream's Measurement ID (`G-…`) into Vercel as `NEXT_PUBLIC_GA_MEASUREMENT_ID`, **Production** only, and redeploy. In the stream's Enhanced measurement settings, turn off "Page changes based on browser history events": the app sends page views itself so it can skip signed-in pages. Leave Google Signals and ads links off.
3. Apply the migration (`supabase db push`, or via CI/the dashboard as usual). Until it's applied, `track()` just logs a warning; saving entries is never affected.

### What Google Analytics shows

Consent is never granted, so GA receives cookieless pings with no client id. GA4 doesn't show those as users or sessions in its standard reports: they count in Realtime, and feed Google's behavioural modelling only once traffic passes its thresholds (roughly 1,000 events a day with consent denied, for at least 7 of the last 28 days). Until then, Vercel is the source of truth for visitors; GA is mainly useful for Realtime, and for Search Console and Google Ads links later. Granting consent would need a cookie banner and a privacy-policy change, which is a product decision.

## Events

Names are fixed by a check constraint on `events.name`; adding one means a migration plus the `EventName` type.

| Name | When | Props |
|---|---|---|
| `entry_logged` | A **new** entry is saved from the log form | `method` (`photo`/`manual`), `detection` (`high`/`medium`/`low`/`none` once the photo check finished, `pending` if saved before it did, `skipped` with no photo), `rated`, `has_note` |
| `card_shared` | A share card is sent from the share screen | `action` (`stories`/`more`/`download`/`copy_text`/`copy_link`), `design` (card design id), `transparent` |

`card_shared` is recorded once the share sheet completes (cancelling records nothing), or when the image is saved or the text or the public page's link copied. On browsers that can't share files, Stories and More save the image, and are recorded under the button tapped.

Not recorded yet: entries saved from the bulk import screen (`/app/import`). Entries from it can still be counted from the `entries` table.

Rules (pgTAP: `supabase/tests/events_test.sql`):
- Write-only: nobody reads events through the API. Query them in the Supabase dashboard SQL editor.
- Signed-in only. `user_id` always comes from the caller's token, so nobody can record events as someone else.
- `props` is a small JSON object (≤ 1 KB). Never put emails, notes, titles or other free text in it. No IP addresses or user agents are stored.
- Events are deleted with the user's account.

For share links, add `?utm_source=…` (e.g. `ig_story`) so both Vercel's referrer view and `waitlist.source` show which shares bring people in.

## Saved queries

Run in the Supabase SQL editor. They map to "How we'll know if it's working" in [the project brief](https://docs.google.com/document/d/1NdEgeTRMkKQ5TL87Urwpe7WG9fcrejPsZKsmrO2Enak/edit).

**Waitlist sign-ups per week, by source** (divide by Vercel's landing-page visitors for conversion)
```sql
select date_trunc('week', created_at)::date as week,
       coalesce(source, '(direct)') as source,
       count(*)
from waitlist
group by 1, 2
order by 1 desc, 3 desc;
```

**Share of users who logged 3+ entries in their first 30 days**
```sql
select count(*) filter (where n >= 3) as logged_3_plus,
       count(*) as users,
       round(100.0 * count(*) filter (where n >= 3) / nullif(count(*), 0)) as pct
from (
  select p.id, count(e.id) as n
  from profiles p
  left join entries e
    on e.user_id = p.id and e.created_at < p.created_at + interval '30 days'
  group by p.id
) per_user;
```

**Share of users who have shared a card**
```sql
select count(distinct e.user_id) as sharers,
       (select count(*) from profiles) as users
from events e
where e.name = 'card_shared';
```

**Do people come back?** (users who logged in two or more different weeks)
```sql
select count(*) filter (where weeks >= 2) as returning, count(*) as users
from (
  select user_id, count(distinct date_trunc('week', created_at)) as weeks
  from entries
  group by user_id
) w;
```

**How entries get logged** (photo vs. by hand, and how detection did)
```sql
select props->>'method' as method,
       props->>'detection' as detection,
       count(*)
from events
where name = 'entry_logged'
group by 1, 2
order by 3 desc;
```

**Shares per week, by button and design**
```sql
select date_trunc('week', created_at)::date as week,
       props->>'action' as action,
       props->>'design' as design,
       count(*)
from events
where name = 'card_shared'
group by 1, 2, 3
order by 1 desc, 4 desc;
```

Public profile views, and which sites send people to them, are in Vercel → Analytics (filter by path `/@…`).

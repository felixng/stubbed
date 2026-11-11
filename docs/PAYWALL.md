# Pro: paid stats contract

The technical contract for the paid tier (epic #219, contract issue #258). It is what #259–#262 build to. Commercial decisions (prices, trial, name) live in the [Stubbed: Project Brief](https://docs.google.com/document/d/1NdEgeTRMkKQ5TL87Urwpe7WG9fcrejPsZKsmrO2Enak/edit); this file covers how the pieces fit. Where they disagree on product, the brief wins.

## 1. What's decided (owner, 1–2 November 2026)

| | |
|---|---|
| Tiers | Free and one paid tier. Display name **"Pro"**, read from config (section 6), never hard-coded in screens. |
| Plans | Monthly and annual. Launch prices £2.99/month and £19.99/year, set in the stores, not in code. |
| Trial | 30 days on every plan at launch, set in the stores. Offer copy (price, period, trial) always comes from the provider at runtime. |
| Existing users | No special treatment. No grandfathering, no founder grants at launch. |
| Platforms | iOS and web together. |
| Providers | RevenueCat for both: Apple In-App Purchase on iOS; RevenueCat Web Billing (Stripe processes cards) on the web. Stubbed is the seller on the web. |
| Not paid | Logging, the diary, trips, entry and trip share cards, the Profile summary, getting your data out. Downgrading never deletes or hides entries or photos. |

**Launch blockers outside the code:** a commercial Vercel plan before web sales or web upgrade prompts go live (Vercel Hobby is non-commercial only; noted on #261), and the owner setup in section 9.

## 2. Free and Pro, field by field

"This year" means the current year as defined in section 4, never a year the client claims.

### `own_insights(selected_year, today)`: the Insights screen, the Profile insights section and the insight share cards

| Field | `selected_year` = this year | `selected_year` = an earlier year | `selected_year` null (All time) |
|---|---|---|---|
| `total`, `unique_shows`, `unlocated` | Free | Pro | Pro |
| `repeated_shows` (most-seen) | Free | Pro | Pro |
| `streaks.current_daily`, `streaks.current_weekly` | Free (they span year boundaries by design) | Free | Free |
| `streaks.longest_daily`, `streaks.longest_weekly` | Free | Pro | Pro |
| `months`, `days`, `countries` | Free | Pro | Pro |
| `years` (year-by-year history) | **Pro**: it reveals earlier years | Pro | Pro |
| `types` (Show mix) | **Pro** | Pro | Pro |

### `own_insight_entries(...)`: drill-downs

| Filter | Free | Pro |
|---|---|---|
| `selected_year` = this year, with `selected_day`, `selected_country` or `selected_show` | Yes | Yes |
| any `selected_type` (Show mix drill-down) | No | Yes |
| `selected_year` earlier, or null | No | Yes |

### Unchanged and free

`own_profile_stats` (the Profile header's all-time counts of shows, venues and cities), `public_profile_stats`, `entry_card_stats` (show of the year, visit number, times seen on entry cards), `feed_entries`, trips, the diary and every read of the user's own entries.

### Share cards

Cards declare what they need; they don't check tiers themselves.

| Card | Needs | Free |
|---|---|---|
| Entry cards (all designs), trip cards | `entry_card_stats`, trip data | Yes |
| Weekly streak (`weekly-streak`) | `streaks.current_weekly` | Yes |
| Year in theatre (`year-in-theatre`), this year | `total`, `months` for this year | Yes |
| Year in theatre, an earlier year | the same, for that year | Pro |
| Show mix (`show-mix`) | `types` | Pro |

A locked card shows an upgrade state built from sample content (never the user's real data blurred), and its export, Stories, download and copy actions are disabled.

## 3. One access policy

Access is decided in Postgres, once, and every client reads the result.

- **Policy table.** `public.feature_access(feature text primary key, tier text check (tier in ('free','pro')))`, seeded with: `insights.current_year` free, `insights.past_years` pro, `insights.all_time` pro, `insights.show_mix` pro. Changing a benefit is one row; Insights and cards follow it on both platforms.
- **Resolver.** `public.has_feature(feature text) returns boolean`, using the caller's effective membership (section 5) and `app_config.paywall_gates_enabled` (section 6). When gates are disabled, everything is allowed.
- **Gated responses keep their shape.** `own_insights` returns every field as today, plus `access`: `{ "tier": "free"|"pro", "locked": ["types", "years", ...], "period": "current"|"past"|"all" }`. A locked field is returned **empty** (`[]`, or `0` for numbers inside a locked period), never its real value. New clients render `locked` as an upgrade state, not as zero. Old clients still decode (section 8).
- **Drill-downs** return no rows plus a `42501` error (`insufficient_privilege`, message `upgrade_required:<feature>`) for a locked filter, so clients can tell "locked" from "no results".
- **Hidden leaks.** A this-year response must not carry earlier years through `years`, longest-streak runs or comparisons; the field table above is the complete list to check.

## 4. "This year"

`own_insights` keeps its `today` parameter (the device's local date, for streaks in the user's time zone), but the server clamps it to `current_date ± 1 day` (covering every time zone), and "this year" is the year of the clamped date. A client sending a different `today` can't turn an earlier year into this year.

## 5. Membership

```
billing_customers   user_id (pk, = auth uid), revenuecat_app_user_id (= user_id), created_at
subscriptions       id, user_id, provider ('app_store' | 'rc_web'), product_id, store_transaction_id,
                    environment ('sandbox' | 'production'), status ('trial' | 'active' | 'grace' | 'cancelled' | 'expired' | 'refunded'),
                    will_renew, period_end, updated_at, last_event_id
billing_events      event_id (pk), received_at, processed_at, error   -- idempotency and audit
membership_grants   user_id, reason, starts_at, ends_at, granted_by   -- deliberate grants; none at launch
```

- **Identity.** RevenueCat's App User ID is the Supabase user UUID on both platforms (`Purchases.logIn(uuid)` on iOS; the same ID in Web Billing checkout, set by the server). Logging out calls `Purchases.logOut()`; switching accounts never carries Pro across.
- **Effective membership.** `public.my_membership()` returns `{ tier, source, expires_at, will_renew, is_trial, manage }` for the caller only. Pro when any subscription in the current environment is `trial`, `active`, `grace` or `cancelled` with `period_end` in the future, or a grant is current. `manage` says where to manage it: `app_store` or `web`.
- **Who writes.** Only the server. Clients can't insert, update or grant; RLS gives owners read access to their own rows and nothing else. No client-editable `is_pro` anywhere.
- **Environments.** Each deployment's `app_config.billing_environment` (`sandbox` locally and in previews, `production` live). Rows from the other environment never count.

### Lifecycle

| Event | Membership |
|---|---|
| Purchase or trial start | Pro (`is_trial` for trials) |
| Renewal | Pro, new `period_end` |
| Cancel renewal | Pro until `period_end`, then Free |
| Billing problem | Pro during the store's grace period (`grace`), then Free |
| Refund or revocation | Free immediately |
| Expiry | Free |
| Monthly ↔ annual | Pro; product and `period_end` update |
| Pro from both iOS and web | Pro; `manage` lists both; neither app offers another purchase |
| Account deletion | `delete_my_account` deletes billing rows and the RevenueCat customer; the confirmation tells store subscribers to cancel in their store settings |

### Sync

- **Webhook.** `POST /api/billing/revenuecat` (Vercel), authenticated with RevenueCat's authorization header secret. It records the event id, then **fetches the customer's current state from RevenueCat's API** and upserts `subscriptions` from that, rather than trusting the event body (`billing_apply_snapshot` replaces the user's rows in one transaction and marks the event processed; a `TRANSFER` syncs both sides). Duplicate and out-of-order events converge on the same state. An event is marked processed only after the upsert succeeds; failures are logged with the error and retried by RevenueCat.
- **Refresh.** `POST /api/billing/refresh` (signed-in caller, Bearer token from iOS) does the same fetch for the caller. Both apps call it after a purchase or restore, on foreground and on sign-in. The SDK's success alone never shows Pro; the UI shows "Confirming…" until `my_membership()` says Pro.
- **Reconciliation.** A daily Vercel cron (`GET /api/billing/reconcile`, `Authorization: Bearer ${CRON_SECRET}`) re-fetches users with a subscription that ended in the last 30 days, least recently synced first, so a missed webhook heals within a day. It also deletes queued RevenueCat customers of deleted accounts (`billing_customer_deletions`). It is runnable by hand for support ("paid but still locked").
- **How the server writes** (owner, 8 Nov 2026). The billing routes use a Supabase secret key (`SUPABASE_SECRET_KEY`) held in Vercel, through a `server-only` client that only `lib/billing/*` may import. The daily reconcile is a Vercel cron (`/api/billing/reconcile`, `CRON_SECRET`). Every billing route returns 503 while its keys are missing, so the code ships before the setup in section 9. #259 has the RevenueCat field mapping.
- **Account deletion.** Billing rows cascade with the user. A trigger queues the RevenueCat App User ID, and the daily reconcile deletes that customer in RevenueCat.

## 6. Config

`public.app_config` (key, value, public read) holds:

| Key | Launch value | Meaning |
|---|---|---|
| `pro_display_name` | `Pro` | The tier's name in both apps |
| `paywall_sales_enabled` | `false` until launch | Shows upgrade prompts and the paywall. Off: no prompts, existing subscribers keep Pro. |
| `paywall_gates_enabled` | `false` until launch | Turns on section 2's locks. Off: everything free. |
| `billing_environment` | `sandbox` / `production` | Which subscription rows count |
| `paywall_preview_admins` | `true` until launch | Admins (`app_metadata.role = "admin"`) get both switches as if on, so they can test the real locks, prompts and sandbox checkout in TestFlight and production. `my_membership()` reports it as `paywall_preview`. Turn off once Pro is live. |

The two flags are separate so sales and locks can be switched independently and rolled back without touching subscribers. Prices, periods and trials are **not** stored here: they come from RevenueCat offerings at runtime, so they change in the dashboards without a release.

## 7. Clients

- **One paywall per app**, opened from: the Profile callout, the locked Show mix section in Insights (an inline banner in place of the chart), and choosing an earlier year or All time. It remembers where it was opened from and returns there after a confirmed purchase or restore.
- **Offer copy** from the current RevenueCat offering: localised price, billing period and trial terms (only when the user is eligible). Buttons say "Start free trial" only with an eligible trial, otherwise "Upgrade". Restore is always visible on iOS.
- **Pro users** see their membership and a manage button for the right store, never an upgrade prompt.
- **Analytics** (`docs/ANALYTICS.md`): `paywall_viewed` and `purchase_completed`, with `source` (`profile`, `show_mix`, `past_year`, `all_time`) and `platform`. Payment truth comes from `subscriptions`, not events.
- iOS uses the RevenueCat SDK (Swift Package; a new dependency, approved with this epic). The web uses RevenueCat's browser SDK, `@revenuecat/purchases-js` (a new dependency, approved 8 Nov 2026), configured with the signed-in user's id from the server-rendered session. A tampered client could at most pay for Pro on a different account; membership still comes only from the server's fetch. As built (#468): `lib/web-checkout.ts` holds the flow (pure, tested with the SDK mocked) and `lib/revenuecat-web.ts` the SDK wrapper, using the public key `NEXT_PUBLIC_REVENUECAT_WEB_BILLING_KEY` (empty: the unavailable offer). A purchase calls `POST /api/billing/refresh`, then polls `my_membership()` for up to 30 s ("Confirming…"); only that moves the person on, never the SDK's success or a URL. `/app/settings/membership` shows tier, source, renewal or end and trial, with Manage on the web (the SDK's `managementURL`) or an App Store note and link; a Pro member is never offered checkout.

## 8. Rollout order

1. Ship the database changes with both flags off. Nothing changes for anyone.
2. Ship iOS and web builds that read `access`, show locks and the paywall, and tolerate empty locked fields.
3. Test purchases in sandbox end to end (#262), including web ↔ iOS and every lifecycle row.
4. Turn on `paywall_gates_enabled`, then `paywall_sales_enabled`, in production.

Old iOS builds (before step 2) keep working after step 4: they decode the same shape and see empty Show mix and history instead of a lock. That's acceptable for the few weeks until users update; it never crashes and never shows paid data.

## 9. Owner setup (needs-human)

- [ ] App Store Connect: sign the Paid Apps Agreement; add banking and tax details.
- [ ] App Store Connect: subscription group "Stubbed Pro" with `stubbed_pro_monthly` (£2.99) and `stubbed_pro_annual` (£19.99), each with a 30-day free introductory offer; enable Billing Grace Period.
- [ ] RevenueCat: project with an iOS app and a Web Billing app; entitlement `pro` attached to all four products; offering `default` with monthly and annual packages; webhook to `/api/billing/revenuecat` with an authorization secret.
- [ ] Stripe: account connected to RevenueCat Web Billing; matching monthly and annual web products with the 30-day trial.
- [ ] Secrets in Vercel (never in the repo): `SUPABASE_SECRET_KEY`, `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `CRON_SECRET`, `NEXT_PUBLIC_REVENUECAT_WEB_BILLING_KEY`. The iOS public SDK key goes in `REVENUECAT_IOS_API_KEY` in the xcconfigs. Exact steps: #469.
- [ ] VAT: check registration and collection for web sales, where Stubbed is the seller. Apple handles tax for iOS.
- [ ] Vercel: a commercial plan (or another host) before `paywall_sales_enabled` goes on in production.

## 10. Build slices

Re-planned 8 Nov 2026. Epic #219 is the build, which Claude does end to end with both switches off. Epic #470 is the launch, which needs the owner.

| Order | Issue | Delivers |
|---|---|---|
| done | #414 | Membership tables, `my_membership`, `feature_access`, `has_feature`, `app_config` |
| 1 | #465 | Sections 2–4 in Postgres: gated `own_insights` and drill-downs, the `access` key, the trusted year, analytics event names |
| 2 | #259 | Section 5's sync: webhook, refresh, daily reconcile, deletion queue |
| 3 | #466 | Backstage membership lookup, billing health, support runbook (section 11) |
| 4 | #260 | iOS locks, Profile callout and the one paywall (placeholder offer) |
| 5 | #467 | iOS RevenueCat purchase, restore and manage |
| 6 | #226 | Web Insights screen, with neutral locked slots |
| 7 | #261 | Web locks, Profile callout and the one paywall (placeholder offer) |
| 8 | #468 | Web checkout with `purchases-js`, and the membership page |
| launch | #469, #262 | Owner setup (section 9); sandbox matrix and the rollout in section 8 |

## 11. Support runbook

Start at **/app/backstage/membership** (admins only). Look the person up by handle: it shows their membership, every subscription row (provider, environment, status, end date, renewal), grants and the last 10 billing events, plus **billing health** (which of the five variables are set, never their values; a button that tests the RevenueCat key; the config switches; the time of the last processed webhook and last reconcile). "Re-sync from RevenueCat" runs the same fetch-and-apply as `/api/billing/refresh` for that person.

- **Paid but still locked.** Look them up. If they show Free, press Re-sync. Still Free: check the subscription's **environment** against `billing_environment` in the config (a sandbox purchase doesn't count in production), and that RevenueCat's App User ID for the purchase is their Stubbed user id (a purchase under an `$RCAnonymousID` or another account belongs to that id; the RevenueCat dashboard can transfer it). A billing event with an error means the webhook failed; Re-sync fixes the state and the daily reconcile would anyway.
- **Restore on a new phone.** The person signs in to the same Stubbed account and taps Restore purchases (iOS) or opens Membership (web). Pro follows the account, not the phone.
- **Subscribed on the wrong account.** Apple ties the purchase to the Apple ID, RevenueCat to the App User ID it was made under. Ask the person to sign in to the account they want on the phone and restore; RevenueCat transfers it (a `TRANSFER` event syncs both accounts). If it doesn't, transfer it in the RevenueCat dashboard, then Re-sync both people.
- **Cancelling and refunds.** The person cancels in the App Store (iOS) or from the web Membership page; Pro continues to the end of the period. Apple refunds go through Apple (reportaproblem.apple.com). Web refunds go through the RevenueCat dashboard. A refund makes the subscription `refunded` and the person Free at once.
- **Turning sales or gates off without touching subscribers.** Set `paywall_sales_enabled` or `paywall_gates_enabled` to `false` in `app_config`. Off sales: no prompts or paywall, existing subscribers keep Pro. Off gates: everything is free again. No subscription rows change either way.
- **Missing keys.** Any of the billing variables missing makes the billing routes answer 503 and the apps show "Upgrades aren't available yet"; nothing else is affected.

# Notification operation and acceptance

The initial notification backend is deployed separately from the UI simplification. This follow-up PR does not itself authorize another production rollout, paid service or plan upgrade.

## Simplification rollout

The follow-up `20261031233000_simplify_notification_preferences.sql` removes general preferences and inbox opt-outs. Coordinate it with the replacement web/iOS clients: the previous TestFlight build still requests removed fields/RPCs on its settings screen. The inbox and push-category choices remain; history is retained, but previously hidden live inbox history becomes visible. No historical outbox is backfilled. Do not apply the cleanup to production before the replacement clients are ready.

For this policy, test only category push switches, the contextual callout before permission/after denial, its disappearance when enabled, and OS preview/Focus settings. The earlier checklist below describes the original release and its removed master/preview/quiet-hour/inbox controls no longer apply. Browser logout/session safety and all source privacy checks remain.

## Configuration

The `notification_policy` singleton in the first migration is the canonical policy configuration for both clients. Named values: `like_group_window` (24h), `like_push_delay` (5min), `push_expiry` (24h), `inbox_retention` (90d), `retry_delays_seconds` ([60,300,900,3600,10800]), `lease_duration` (2min), `repeat_push_cooldown` (24h, added by the integration migration and explicitly approved by the owner). Change values with a reviewed data migration; clients do not carry competing timing constants. Quiet time and lock-screen preview visibility are controlled by the device OS. Push payloads include live eligible actor/action/show copy, never comment bodies. Only push-category choices are stored; there is no master push preference or inbox opt-out.

Source keys: `like:<entry>:<actor>:<source-generation>`, `comment:<comment-id>`, `follow:<follower>:<followee>:<source-generation>`, `accepted:<follower>:<followee>:<source-generation>`. Like and follow rows have a server-owned UUID generation, so replaying an action is idempotent while delete/reinsert is a genuinely new event. Current-source validation prevents old request generations from reviving as duplicate rows. The independent 24-hour `repeat_push_cooldown` limits repeat like/relationship push intents from the same actor/category/entry; a new request still becomes unread and actionable. Distinct comments are not muted by that cooldown.

Inbox rows have globally increasing revisions; delivery uniqueness is `(notification, queued revision, destination)`. The newest live eligible push intent supersedes older queued intents. If its source is withdrawn, only a previously superseded, still-live and unread intent may resume with its original attempts and expiry. Exact source validation prevents a later inbox-only revision from reviving a withdrawn alert. An inbox-only revision during cooldown does not erase a legitimate pending alert. New likes restart the configured collection delay when they produce a new eligible push intent. Each enabled installation can receive its own delivery.

The SQL queue owns retry/lease state. A retry has at most six send attempts with the configured bounded backoff, also bounded by expiry. Invalid destinations are removed unless refreshed after the failed attempt began. Provider acceptance is recorded as `accepted`, never `delivered`. A crash after a provider accepts but before acknowledgement can lead to a duplicate alert. APNs collapse IDs/browser notification tags replace related displayed alerts where supported; they do not guarantee device deduplication.

## Deployment configuration

1. Apply migrations in timestamp order before deploying clients that use their RPCs.
2. Enable Push Notifications for the existing Apple App ID, refresh signing profiles, and use a dedicated APNs signing key with the existing Apple Developer membership. Keep `APNS_PRIVATE_KEY`, `APNS_KEY_ID` and `APNS_TEAM_ID` in Edge Function secrets only. Never add the `.p8` to Git, issues, screenshots or PR descriptions. Debug sends to APNs sandbox; Release sends to production; topic is fixed server-side to `app.getstubbed`.
3. Generate a random `NOTIFICATION_WORKER_SECRET`, store it server-side and in Supabase Vault. Deploy `notification-worker` only after explicit deployment authorization. `verify_jwt=false` does not make the endpoint public: it requires the server-only `x-notification-worker-secret` header. Browser/account JWTs do not authorize dispatch.
4. After a controlled dispatch check and explicit authorization, configure a once/minute pg_cron/pg_net call using Vault-held URL and worker secret, following https://supabase.com/docs/guides/functions/schedule-functions. This repo deliberately does not install an active schedule.
5. A batch currently handles three sends sequentially with 10-second operation timeouts (claim + prepare/send/ack per job), fitting within Free's 150-second wall-clock budget. Once/minute scheduling is at most 44,640 invocations per 31-day month versus Free's current 500,000/month allowance; all project usage shares quotas. Check actual CPU/runtime under real delivery load, DB storage, egress, queue age and terminal failures. Do not upgrade or add capacity automatically.

Device registrations are authenticated and private. An installation has a random ID and separate revocation secret; possession allows deletion only, even after the session expires. Native logout rotates the identity, queues old cleanup durably and retries it. No client can read token/subscription tables or call dispatch RPCs. Account deletion cascades destinations and queued jobs. Offline logout cannot immediately inform a server: verify deferred cleanup when reconnecting before treating logout acceptance as complete.

## Outstanding real-device acceptance

Builds, simulated permissions, fake transports and provider acceptance are not end-to-end device verification.

### Native iPhone

- Install a development-signed build with Push capability; use sandbox credentials. Sign into a disposable local/staging account whose backend has these migrations and worker configured. Confirm the contextual callout appears before permission, with no master switch or permanent permission row; first launch must not prompt.
- Open the inbox or Notification settings, tap Enable, deny. Reopen/relaunch: the callout offers Open iPhone Settings, with no repeated prompt. Change OS permission outside Stubbed, return: registration reconciles. Revoke and verify destination removal/retry.
- Allow on a fresh installation: the permission invitation disappears. From another account, like/comment/follow/request/approve. Verify grouped likes, all five category push switches, actor/action/show previews without comment body, and read-on-web suppressing queued push. Turning off a push category must not suppress inbox activity. Use iOS Show Previews and Focus settings to verify native privacy/quiet-time behavior.
- Verify foreground (inbox without duplicate OS banner), background and terminated delivery/cold start. Tap opens the exact entry/comments/person/requests after sign-in; deleted/inaccessible activity goes neutrally to Notifications.
- Log out offline, reconnect, verify old cleanup; sign into another account and confirm no former-account pushes. Rotate APNs token, simulate invalid token/provider retry, and delete the account. Verify sandbox and production separately; simulator injection is not APNs verification.

### Shared inbox and web

- Inspect running desktop and mobile web layouts with representative test data, keyboard navigation and screen reader labels. Capture both sizes and update the existing gallery/PR evidence. Local browser control is currently disabled in Work settings, so these captures remain outstanding.
- Verify pagination, loading, empty/error/offline/retry, cross-client read/badge updates, mark-all concurrent activity, all five push categories, no inbox controls, pending request actions, removal/deletion/privacy/block changes and failed preference saves.

Outside-app alerts already accepted by a provider are in flight and cannot be recalled reliably after logout, revocation or a privacy change. Pre-send eligibility is rechecked, previews default off, and tokens/subscriptions are removed promptly when observable. Do not promise that permission revocation or cleanup retracts an alert that was already displayed/accepted.

### iPhone Home Screen and Android browser

- Use HTTPS and a test account/backend with migrations, worker and VAPID configured. iPhone/iPad needs iOS/iPadOS 16.4+; verify an older supported version and current iOS. Ordinary browser tabs show Add to Home Screen guidance, never request iOS tab push. Open the installed icon, Settings → Notifications → Enable, then accept the OS prompt.
- On Chrome Android, open the HTTPS site, sign in, Settings → Notifications → Enable. Verify browser-tab push without installation; repeat after adding a Home Screen shortcut. No Play Store app is required. Other browsers depend on capability and a supported browser push endpoint; unsupported clients retain the inbox.
- Deny, revisit, relaunch and revoke externally. No repeated prompt; blocked guidance explains browser/system settings. Browser permission reset after refusal remains blocked locally until manually allowed. A previously granted permission does not itself prove subscription registration succeeded.
- Verify foreground/background/closed delivery, grouped likes, actor/action/show previews and OS preview controls, permission revoked, invalid/expired subscriptions, offline logout/reconnect, account switching and account deletion. Click existing-window and cold-start notifications; follow through sign-in and check exact visit/comments/profile/requests routing. Change/delete/block the source before dispatch and before opening.
- Verify desktop (including touch-capable desktop) never calls requestPermission, subscribe or registration RPC. Opening desktop must not alter other installations. Verify iPad desktop user agent with touch in both installed and ordinary-tab contexts.
- Browser Web Push requires a visible notification on receipt, particularly Safari. Draft platform-safe foreground default: pre-send read suppression, one browser notification, no extra in-app banner; an already in-flight push may appear while the destination is open. Owner confirmation was requested. Never suppress received Safari pushes silently as if they were APNs.
- Service worker session verification downgrades previews to generic copy when logged out, switched account or offline. It caches no authenticated pages or private notification history. Verify expired-subscription cleanup cannot remove a newer replacement.

## VAPID ownership and rotation

One key pair belongs to this Supabase/Stubbed deployment. Generate it locally using the pinned web-push library. Store `VAPID_PRIVATE_KEY` and `VAPID_PUBLIC_KEY` in Edge Function secrets; only the identical public key goes into web `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`. No keys were generated for production or added to these PRs. The server-only worker secret is separate from VAPID.

Rotate deliberately: coordinate public/private configuration, publish the new public key only with deployment approval, and expect existing subscriptions to require renewal. After loading the new web configuration, the next foreground visit compares the subscription's application-server key, removes old registration/subscription state, and offers Enable again without another OS prompt when permission remains granted. Old endpoints are not assumed compatible with the new private key. Monitor transient failures/backlog during rotation; do not keep arbitrary old private keys or add a key-management service automatically.

Supported endpoint origins are explicit: Apple web push, FCM and Mozilla push. Server registration validates HTTPS, origin and key shape; sender validation also rejects credentials, unusual ports and redirects. Platform labels are explicit client eligibility claims, not physical-device attestation or fingerprinting. A modified client can lie about its platform; supported product clients never create desktop subscriptions.

## Checks run locally

- Fresh isolated Supabase migration replay and full SQL suite: 434 assertions across 29 files passed. An upgrade fixture with legacy master/quiet/inbox preferences preserved the push-category choice and inbox/read revisions, removed obsolete state, and enqueued no historical delivery.
- Web lint/typecheck and 98 unit tests passed; Webpack production build passed. Default Turbopack build was attempted and failed on this environment's local port-binding restriction, including an escalated attempt.
- Deno 2.1.4 strict worker check passed; the pinned library's ephemeral VAPID/encryption contract test passed without network delivery. Reproduce with `pnpm dlx deno@2.1.4 check --config supabase/functions/notification-worker/deno.json supabase/functions/notification-worker/index.ts` and `pnpm dlx deno@2.1.4 test --allow-env --config supabase/functions/notification-worker/deno.json supabase/functions/notification-worker/web-push-contract.test.ts`.
- Final local Edge Runtime authentication smoke check: 401 without worker secret; 200 with a disposable test secret and an empty batch. No provider delivery was attempted.
- Native unit tests (including denied/revoked fakes) passed. Follow-up UI tests passed on iPhone SE and iPhone 17 Pro, including normal/largest text, exact row routing and a real simulator Allow prompt followed by the invitation disappearing. The final allowed settings screen was captured and inspected. Final captures were inspected; the Pro run used OS dark appearance and confirmed the app's existing forced-light presentation. It does not prove a separate native dark theme.
- Generated Swift types match the fresh replayed database. No physical-device records were detected by devicectl; provider credentials were not configured in this process. Web runtime screenshots and real-device acceptance remain outstanding.

The like collection delay is a debounce: fresh eligible push intents restart its configured delay, while inbox activity updates immediately even when repeat push is limited. Sustained activity can postpone that grouped push until a pause. This behaviour is explicit for review; do not describe it as one push per like or guaranteed delivery at a fixed minute.

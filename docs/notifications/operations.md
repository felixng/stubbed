# Notification operation and acceptance

No deployment, hosted migrations, schedule activation, paid service or plan upgrade is authorized by these PRs.

## Configuration

The `notification_policy` singleton in the first migration is the canonical policy configuration for both clients. Named values: `like_group_window` (24h), `like_push_delay` (5min), `push_expiry` (24h), `inbox_retention` (90d), `retry_delays_seconds` ([60,300,900,3600,10800]), `lease_duration` (2min). Change values with a reviewed data migration; clients do not carry competing timing constants. Quiet hours are user-selected wall-clock times plus an IANA zone; overnight ranges work. They discard social pushes rather than scheduling a catch-up burst.

Source keys: `like:<entry>:<actor>`, `comment:<comment-id>`, `follow:<follower>:<followee>`, `accepted:<follower>:<followee>`. Like/follow keys survive unlike/unfollow until history retention, preventing repeated alert spam. Inbox rows have globally increasing revisions; delivery uniqueness is `(notification, revision, destination)`. New likes within a group create a revision and a collection delay; obsolete revisions are cancelled. Each enabled installation can receive its own delivery.

The SQL queue owns retry/lease state. A retry has at most six send attempts with the configured bounded backoff, also bounded by expiry. Invalid destinations are removed unless refreshed after the failed attempt began. Provider acceptance is recorded as `accepted`, never `delivered`. A crash after a provider accepts but before acknowledgement can lead to a duplicate alert. APNs collapse IDs/browser notification tags replace related displayed alerts where supported; they do not guarantee device deduplication.

## Future deployment setup (owner action, not performed)

1. Apply migrations in timestamp order before deploying clients that use their RPCs.
2. Enable Push Notifications for the existing Apple App ID, refresh signing profiles, and use a dedicated APNs signing key with the existing Apple Developer membership. Keep `APNS_PRIVATE_KEY`, `APNS_KEY_ID` and `APNS_TEAM_ID` in Edge Function secrets only. Never add the `.p8` to Git, issues, screenshots or PR descriptions. Debug sends to APNs sandbox; Release sends to production; topic is fixed server-side to `app.getstubbed`.
3. Generate a random `NOTIFICATION_WORKER_SECRET`, store it server-side and in Supabase Vault. Deploy `notification-worker` only after explicit deployment authorization. `verify_jwt=false` does not make the endpoint public: it requires the server-only `x-notification-worker-secret` header. Browser/account JWTs do not authorize dispatch.
4. After acceptance verification and explicit authorization, configure a once/minute pg_cron/pg_net call using Vault-held URL and worker secret, following https://supabase.com/docs/guides/functions/schedule-functions. This repo deliberately does not install an active schedule.
5. A batch currently handles three sends sequentially with 10-second operation timeouts (claim + prepare/send/ack per job), fitting within Free's 150-second wall-clock budget. Once/minute scheduling is at most 44,640 invocations per 31-day month versus Free's current 500,000/month allowance; all project usage shares quotas. Check actual CPU/runtime under real delivery load, DB storage, egress, queue age and terminal failures. Do not upgrade or add capacity automatically.

Device registrations are authenticated and private. An installation has a random ID and separate revocation secret; possession allows deletion only, even after the session expires. Native logout rotates the identity, queues old cleanup durably and retries it. No client can read token/subscription tables or call dispatch RPCs. Account deletion cascades destinations and queued jobs. Offline logout cannot immediately inform a server: verify deferred cleanup when reconnecting before treating logout acceptance as complete.

## Outstanding real-device acceptance

Builds, simulated permissions, fake transports and provider acceptance are not end-to-end device verification.

### Native iPhone

- Install a development-signed build with Push capability; use sandbox credentials. Sign into a disposable local/staging account whose backend has these migrations and worker configured. Confirm the app preference starts on while OS state says Permission needed; first launch must not prompt.
- Open Notification settings, tap Enable, deny. Reopen/relaunch: state is Blocked, no repeated prompt. Change OS permission outside Stubbed, return: registration reconciles. Revoke and verify destination removal/retry.
- Allow on a fresh installation. From another account, like/comment/follow/request/approve. Verify grouped likes, each category switch, master-off preserving choices, generic preview, preview-on without comment body, quiet hours including overnight/DST, and read-on-web suppressing queued push.
- Verify foreground (inbox without duplicate OS banner), background and terminated delivery/cold start. Tap opens the exact entry/comments/person/requests after sign-in; deleted/inaccessible activity goes neutrally to Notifications.
- Log out offline, reconnect, verify old cleanup; sign into another account and confirm no former-account pushes. Rotate APNs token, simulate invalid token/provider retry, and delete the account. Verify sandbox and production separately; simulator injection is not APNs verification.

### Shared inbox and web

- Inspect running desktop and mobile web layouts with representative test data, keyboard navigation and screen reader labels. Capture both sizes and update the existing gallery/PR evidence. Local browser control is currently disabled in Work settings, so these captures remain outstanding.
- Verify pagination, loading, empty/error/offline/retry, cross-client read/badge updates, mark-all concurrent activity, all five categories, pending request actions, removal/deletion/privacy/block changes and failed preference saves.

Outside-app alerts already accepted by a provider are in flight and cannot be recalled reliably after logout, revocation or a privacy change. Pre-send eligibility is rechecked, previews default off, and tokens/subscriptions are removed promptly when observable. Do not promise that permission revocation or cleanup retracts an alert that was already displayed/accepted.

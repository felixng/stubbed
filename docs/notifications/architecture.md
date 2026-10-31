# Notifications, slices 1–4

Scope: five social categories, shared inbox/read state, native iOS and mobile Web Push. Desktop has an inbox only. Reminders, recaps and email are deferred. The settings/profile split landed in #227; this work builds on it.

Postgres owns event intake, eligibility/privacy, grouping, preferences and inbox persistence. Social action triggers enqueue delivery work in the same transaction as inbox creation. Only successful actions become events. Immutable source-generation keys prevent replay. A separate, owner-confirmed 24-hour repeat-push cooldown prevents unlike/re-like or follow/unfollow alert spam without hiding new actionable request cycles. Reads and counts recheck live source records, visibility and blocks; stale activity cannot survive through cached notification copy.

The notification application worker consumes a small queue interface and channel-specific send interfaces. Composition injects APNs and Web Push adapters. Adapters return accepted, retryable, invalid destination or permanent failure; accepted is not proof of device delivery. No provider SDK decides product policy. Native and web registrations are different destination shapes.

Delivery jobs use leases, revision/destination uniqueness, bounded retries, expiry and invalid-destination removal. A worker crash after provider acceptance can cause redelivery: processing is idempotent where possible, device delivery is not exactly once. Recheck eligibility immediately before sending. Account preferences/read state are shared; registrations and OS/browser permission belong to the installation. Both enabled native/web installations can receive alerts; there is no physical-device fingerprinting.

## Policy configuration

Timing values must be named, documented and centrally enforced in Postgres, rather than independently hardcoded into either client. Initial named values explained to owner (31 October): like grouping 24h; like push collection 5min; push expiry 24h; inbox retention 90d. Grouping combines inbox activity; collection delays likes to batch their push. Expiry drops stale queued delivery. Retention removes old history, not pending requests from the requests list. Quiet hours drop social delivery without a catch-up burst. Previews default off; comment bodies never leave the inbox destination.

## Review order and ownership

One implementation worker owns integration, shared contracts and the migration sequence. Four dependent PRs: #240 navigation, #241 shared inbox, #242 native APNs, #243 mobile web. Slice 1's empty destination and badge integration are completed by slice 2; do not ship the navigation scaffold alone as a working notification system. All PRs remain unmerged and undeployed. Each later migration has a strictly later timestamp.

## Cost and operations

Use the existing Supabase backend, an Edge Function worker and pg_cron/pg_net, with secrets in Vault/Edge Function secrets. No vendor, paid plan or external service. Free currently includes 500,000 function invocations/month; once/minute is at most 44,640/month before other usage. Keep invocation batches bounded to stay below the Free runtime limits (150 seconds wall time, 2 seconds CPU). Monitor queue age, failures, DB storage, egress and total project usage; free capacity is shared and not an unlimited-delivery guarantee. Migrations must not activate a hosted schedule. Deployment/credentials/real-device verification are separate outstanding acceptance work.

References checked 31 October 2026: https://supabase.com/docs/guides/functions/pricing, https://supabase.com/docs/guides/functions/limits, https://supabase.com/docs/guides/functions/schedule-functions, https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/.

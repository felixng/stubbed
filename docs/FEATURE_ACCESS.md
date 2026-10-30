# Feature access foundation

Status: initial database foundation, 2026-10-30. Nothing is paywalled at launch.
RevenueCat + Stripe is the preferred future integration, not a dependency.

## Contract

`feature_access_policies` maps stable capability keys to an optional entitlement.
NULL means free for signed-in users; `pro` will require an active grant.
Initial keys: `extra_photos`, `advanced_insights`, `premium_card_styles`.
A policy registers access only: it does not implement the feature.

Both clients can call `own_feature_access()` for display decisions. Protected
operations must call `can_access(key)` in the database or under the requesting
user's session in a server route. Never check as service_role on a user's behalf.
No user-id parameter is accepted. Unknown keys are denied. Only trusted server
code or database administration can write policies and grants. RLS keeps grants
private to their owner. Neither client can elevate its access.

`access_grants` represents independently revocable subscription or promotional
access. Use the Supabase auth UUID as the account identity. A grant is valid from
`starts_at` inclusive to `expires_at` exclusive, unless revoked. NULL expiry is
supported but founder promotions should have explicit expiry. Account deletion
cascades to grants. Multiple valid grants combine; an expired founder promotion
must not overwrite an active paid subscription.

## Future provider adapter

The billing provider remains authoritative for paid subscription state. An adapter
normalizes it into grants; feature code never reads vendor product IDs, customer
objects or SDK state. `source` is a namespace and `source_reference` a stable
external subscription/grant ID; neither is restricted to a vendor enum.

Before integrating live billing:

- Authenticate webhook delivery and keep sandbox and production separate.
- Deduplicate events and reconcile current provider state to handle out-of-order
  delivery; the grant uniqueness constraint alone is not an event processor.
- Map provider products to the internal `pro` entitlement. Bound paid grants to
  the authoritative access expiry, including the chosen grace-period policy.
- Cancellation of renewal must retain access until the paid/trial period ends.
- Reconcile refunds, revocations, transfers, restored purchases and deleted users.
- Protect provider credentials and grant writes on the server.
- Refresh client access after purchase, restore, foregrounding and expiry. Define
  offline/cache behaviour before enabling gates. Do not sell twice to an account
  already entitled through another store.

## Rollout

1. Apply this additive migration and generate TypeScript/Swift database types.
2. Add access loading to both clients without changing launch behaviour.
3. Implement the premium additions and enforce access at their authoritative
   RPC/write/storage/server boundaries, not just buttons. Current RPCs, storage
   policies and card renderers are deliberately unchanged by this foundation.
4. Add billing adapters and purchase/restore/manage UI in sandbox. Add founder
   grants separately; no automatic paid conversion for promotional access.
5. Test cross-client purchase, renewal, expiry, refund, restore, billing failure,
   overlapping grants, RLS and loss of connectivity.
6. Only then set selected policies to `pro`. Changing a policy today does NOT gate
   existing functionality: enforcement has not yet been connected.

Prices, trial length, founder eligibility and the free-versus-paid feature
boundaries remain product decisions. Existing diaries/photos must survive expiry.
Logging and getting your data out remain free. Product context belongs in the
Drive monetisation doc; this file defines the technical contract only.

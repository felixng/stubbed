import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminOnly } from "@/components/app/admin/AdminOnly";
import { ResyncButton, TestKeyButton } from "@/components/app/admin/MembershipActions";
import { BackLink } from "@/components/ui/BackLink";
import { Button } from "@/components/ui/Button";
import { billingHealth } from "@/lib/billing/admin";
import { ownerContext } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Membership" };

type Lookup = {
  found: boolean;
  user_id?: string;
  handle?: string;
  membership?: { tier: string; source: string | null; expires_at: string | null; will_renew: boolean; is_trial: boolean; manage: string[] };
  subscriptions?: { provider: string; product_id: string; environment: string; status: string; period_end: string; will_renew: boolean }[];
  grants?: { reason: string; starts_at: string; ends_at: string }[];
  events?: { event_id: string; received_at: string; processed_at: string | null; error: string | null }[];
};
type Activity = { config: Record<string, string>; last_webhook: string | null; last_reconcile: string | null };

const FIELD = "min-h-11 flex-1 rounded-md border border-separator bg-surface px-3 text-body text-label focus-visible:outline-2 focus-visible:outline-focus";
const CARD = "flex flex-col gap-2 rounded-md border border-separator bg-surface p-4 shadow-sm";
const WHEN = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const when = (iso: string | null | undefined) => (iso ? `${WHEN.format(new Date(iso))} UTC` : "never");

async function Health() {
  const { supabase } = await ownerContext();
  const { data } = await supabase.rpc("admin_billing_activity");
  const activity = (data ?? { config: {}, last_webhook: null, last_reconcile: null }) as unknown as Activity;
  return (
    <div className={CARD}>
      <h2 className="text-headline text-label">Billing health</h2>
      <ul className="text-subheadline text-label">
        {billingHealth(process.env).map((v) => (
          <li key={v.name}><code>{v.name}</code>: {v.set ? "set" : "missing"}</li>
        ))}
      </ul>
      <p className="text-footnote text-label-secondary">
        Config: {Object.entries(activity.config).map(([k, v]) => `${k} = ${v}`).join(", ") || "none"}
      </p>
      <p className="text-footnote text-label-secondary">
        Last webhook processed: {when(activity.last_webhook)} · Last reconcile: {when(activity.last_reconcile)}
      </p>
      <TestKeyButton />
    </div>
  );
}

async function Member({ handle }: { handle: string }) {
  const { supabase } = await ownerContext();
  const { data } = await supabase.rpc("admin_membership", { handle });
  const m = (data ?? { found: false }) as unknown as Lookup;
  if (!m.found) return <p className="text-subheadline text-label-secondary">No one has the handle @{handle.replace(/^@/, "")}.</p>;
  const pro = m.membership?.tier === "pro";
  return (
    <div className="flex flex-col gap-3">
      <div className={CARD}>
        <h2 className="text-headline text-label">@{m.handle}: {pro ? "Pro" : "Free"}</h2>
        {pro && (
          <p className="text-subheadline text-label-secondary">
            {m.membership?.is_trial ? "Trial" : "Paid"} via {m.membership?.source} until {when(m.membership?.expires_at)}
            {m.membership?.will_renew ? ", renews" : ", doesn’t renew"}. Manage: {m.membership?.manage.join(" and ") || "n/a"}.
          </p>
        )}
        <ResyncButton userId={m.user_id!} />
      </div>
      <div className={CARD}>
        <h2 className="text-headline text-label">Subscriptions</h2>
        {m.subscriptions?.length ? (
          <ul className="text-subheadline text-label">
            {m.subscriptions.map((s, i) => (
              <li key={i}>{s.provider} · {s.product_id} · {s.environment} · {s.status} · ends {when(s.period_end)} · {s.will_renew ? "renews" : "no renewal"}</li>
            ))}
          </ul>
        ) : <p className="text-subheadline text-label-secondary">None.</p>}
        {!!m.grants?.length && (
          <>
            <h3 className="text-subheadline font-semibold text-label">Grants</h3>
            <ul className="text-subheadline text-label">
              {m.grants.map((g, i) => <li key={i}>{g.reason} · {when(g.starts_at)} to {when(g.ends_at)}</li>)}
            </ul>
          </>
        )}
      </div>
      <div className={CARD}>
        <h2 className="text-headline text-label">Recent billing events</h2>
        {m.events?.length ? (
          <ul className="text-footnote text-label">
            {m.events.map((e) => (
              <li key={e.event_id} className="break-all">{e.event_id} · received {when(e.received_at)} · {e.processed_at ? `processed ${when(e.processed_at)}` : "not processed"}{e.error ? ` · error: ${e.error}` : ""}</li>
            ))}
          </ul>
        ) : <p className="text-subheadline text-label-secondary">None.</p>}
      </div>
    </div>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/app/backstage/membership">, "searchParams">) {
  const raw = (await searchParams).handle;
  const handle = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 40) ?? "";
  return (
    <>
      <form method="get" className="flex gap-3">
        <input name="handle" defaultValue={handle} placeholder="Handle" aria-label="Handle" className={FIELD} />
        <Button type="submit" size="sm">Look up</Button>
      </form>
      {handle ? <Member handle={handle} /> : null}
      <Health />
    </>
  );
}

export default function AdminMembershipPage(props: PageProps<"/app/backstage/membership">) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <BackLink href="/app/backstage">Backstage</BackLink>
        <h1 className="text-title font-display text-label">Membership</h1>
        <p className="text-subheadline text-label-secondary">Look up someone’s Pro membership, re-sync it from RevenueCat, and check billing is set up.</p>
      </div>
      <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
        <AdminOnly>
          <Content searchParams={props.searchParams} />
        </AdminOnly>
      </Suspense>
    </section>
  );
}

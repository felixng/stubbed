import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { ManageMembership } from "@/components/app/pro/ManageMembership";
import { BackLink } from "@/components/ui/BackLink";
import { buttonClass } from "@/components/ui/Button";
import { FREE, parseConfig, type MembershipInfo } from "@/lib/membership";
import { ownerContext } from "@/lib/supabase/data";
import { manageTargets, membershipPreview, sourceLabel, statusLine } from "@/lib/web-checkout";

export const metadata: Metadata = { title: "Membership" };

const PREVIEWS: Record<"free" | "web" | "app_store", MembershipInfo> = {
  free: FREE,
  web: { tier: "pro", source: "subscription", expires_at: "2026-12-09T00:00:00Z", will_renew: true, is_trial: false, manage: ["web"] },
  app_store: { tier: "pro", source: "subscription", expires_at: "2026-12-09T00:00:00Z", will_renew: false, is_trial: false, manage: ["app_store"] },
};

// Tier, where it comes from and when it renews or ends (#468). Read with the caller's own session
// through my_membership(). An App Store subscriber is shown how to manage it there, never checkout.
async function Membership({ searchParams }: Pick<PageProps<"/app/settings/membership">, "searchParams">) {
  await connection();
  const { supabase, userId } = await ownerContext();
  if (!userId) return null;
  const preview = membershipPreview((await searchParams).membershipPreview);
  const [membership, config] = await Promise.all([
    preview ? Promise.resolve({ data: PREVIEWS[preview] }) : supabase.rpc("my_membership"),
    supabase.from("app_config").select("key, value"),
  ]);
  const info = (membership.data ?? FREE) as MembershipInfo;
  const settings = parseConfig(config.data);
  const targets = manageTargets(info);
  const pro = info.tier === "pro";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 rounded-md border border-separator bg-surface p-4 shadow-sm">
        <h2 className="text-headline text-label">{pro ? `${settings.name} member` : "Free plan"}</h2>
        <p className="text-subheadline text-label-secondary">{statusLine(info)}</p>
        {pro && <p className="text-subheadline text-label-secondary">{info.is_trial ? "Trial" : "Subscription"} through {sourceLabel(info)}.</p>}
      </div>
      {pro ? (
        <ManageMembership targets={targets} userId={userId} />
      ) : settings.salesEnabled ? (
        <Link href="/app/pro?from=profile&next=/app/settings/membership" className={`${buttonClass("primary")} self-start`}>Upgrade to {settings.name}</Link>
      ) : null}
    </div>
  );
}

export default function MembershipPage({ searchParams }: PageProps<"/app/settings/membership">) {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <BackLink href="/app/settings">Settings</BackLink>
        <h1 className="text-title font-display text-label">Membership</h1>
      </div>
      <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
        <Membership searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

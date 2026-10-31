import type { Metadata } from "next";
import { Suspense } from "react";

import { BlockedAccounts, type BlockedPerson } from "@/components/moderation/BlockedAccounts";
import { BackLink } from "@/components/ui/BackLink";
import { ownerContext } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Blocked accounts" };

async function Blocked() {
  const { supabase, userId } = await ownerContext();
  if (!userId) return null;
  const { data, error } = await supabase.rpc("my_blocks");
  if (error) throw error;
  return <BlockedAccounts people={(data ?? []) as BlockedPerson[]} />;
}

export default function BlockedPage() {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <BackLink href="/app/settings">Settings</BackLink>
        <h1 className="text-title font-display text-label">Blocked accounts</h1>
      </div>
      <p className="text-subheadline text-label-secondary">You and the people you block can’t see each other’s shows, likes or comments.</p>
      <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}><Blocked /></Suspense>
    </section>
  );
}

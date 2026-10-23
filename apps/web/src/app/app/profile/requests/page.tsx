import type { Metadata } from "next";
import { Suspense } from "react";

import { EmptyState } from "@/components/app/EmptyState";
import { FollowRequests } from "@/components/app/FollowRequests";
import { BackLink } from "@/components/ui/BackLink";
import { PlaceholderRows } from "@/components/ui/PlaceholderRows";
import { listFollowRequests } from "@/lib/follows";
import { ownerContext } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Follow requests" };

async function Requests() {
  const { supabase, userId } = await ownerContext();
  if (!userId) return null;
  const people = await listFollowRequests(supabase, userId);
  if (!people.length) return <EmptyState title="No requests">People who ask to follow you appear here.</EmptyState>;
  return <FollowRequests ownerId={userId} people={people} />;
}

// Requests to follow a private profile, opened from the row on the Profile
// tab. Approving or declining refreshes the list; the last one leaves the
// empty state.
export default function RequestsPage() {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <BackLink href="/app/profile">Profile</BackLink>
        <h1 className="text-title font-display text-label">Follow requests</h1>
      </div>
      <p className="-mt-2 text-subheadline text-label-secondary">
        Approved followers see your public shows. Declining doesn’t tell them.
      </p>
      <Suspense fallback={<PlaceholderRows />}>
        <Requests />
      </Suspense>
    </section>
  );
}

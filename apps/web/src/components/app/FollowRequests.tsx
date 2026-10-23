"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Avatar } from "@/components/profile/Avatar";
import type { FollowPerson } from "@/lib/follows";
import { createClient } from "@/lib/supabase/client";

// Requests to follow the owner's private profile. Approve lets them see the
// owner's public shows; decline deletes the request (they aren't told, and
// can ask again).
export function FollowRequests({ ownerId, people }: { ownerId: string; people: FollowPerson[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  async function answer(followerId: string, approve: boolean) {
    setBusyId(followerId);
    const rows = createClient().from("follows");
    const { error } = approve
      ? await rows.update({ status: "accepted" }).eq("follower_id", followerId).eq("followee_id", ownerId)
      : await rows.delete().eq("follower_id", followerId).eq("followee_id", ownerId);
    if (error) {
      setBusyId(null);
      window.alert(approve ? "Couldn’t approve the request. Try again." : "Couldn’t decline the request. Try again.");
      return;
    }
    startRefresh(() => {
      setBusyId(null);
      router.refresh();
    });
  }

  return (
    <ul className="overflow-hidden rounded-md border border-separator bg-surface shadow-sm">
      {people.map((p) => {
        const name = p.display_name || `@${p.handle}`;
        const busy = busyId === p.id || refreshing;
        return (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-separator px-4 py-3 last:border-b-0">
            <Link
              href={`/@${p.handle}`}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <Avatar name={name} url={p.avatar_url} size={40} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-headline text-label">@{p.handle}</span>
                {p.display_name && <span className="truncate text-subheadline text-label-secondary">{p.display_name}</span>}
              </span>
            </Link>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => answer(p.id, false)}
                aria-label={`Decline @${p.handle}`}
                className="min-h-11 rounded-pill px-4 text-subheadline font-semibold text-label-secondary hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-40"
              >
                Decline
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => answer(p.id, true)}
                aria-label={`Approve @${p.handle}`}
                className="min-h-11 rounded-pill bg-tint px-4 text-subheadline font-semibold text-on-tint shadow-btn hover:bg-tint-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-40"
              >
                Approve
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

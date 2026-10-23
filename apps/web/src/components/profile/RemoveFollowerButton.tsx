"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createClient } from "@/lib/supabase/client";

// Removes someone from the owner's followers. They aren't told; following
// again works as usual (a request, if the profile is private).
export function RemoveFollowerButton({
  followerId,
  followerHandle,
  ownerId,
}: {
  followerId: string;
  followerHandle: string;
  ownerId: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  return (
    <button
      type="button"
      disabled={saving || refreshing}
      onClick={async () => {
        if (!window.confirm(`Remove @${followerHandle} from your followers?`)) return;
        setSaving(true);
        const { error } = await createClient()
          .from("follows")
          .delete()
          .eq("follower_id", followerId)
          .eq("followee_id", ownerId);
        if (error) {
          setSaving(false);
          window.alert("Couldn’t remove this follower. Try again.");
          return;
        }
        startRefresh(() => {
          setSaving(false);
          router.refresh();
        });
      }}
      className="min-h-11 shrink-0 rounded-pill px-4 text-subheadline font-semibold text-destructive hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-40"
    >
      Remove
    </button>
  );
}

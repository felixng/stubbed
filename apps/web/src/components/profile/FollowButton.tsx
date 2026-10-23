"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import type { Viewer } from "@/lib/follows";
import { createClient } from "@/lib/supabase/client";

const LINK_BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-pill px-4 font-sans text-[15px] leading-5 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// Follow / Requested / Following on /@handle. Postgres decides whether a
// follow is accepted at once or waits for approval (private profiles); this
// writes the row, then refreshes the page so counts and shows catch up.
// Signed-out visitors go to sign in and come back here; the owner gets a
// link to edit their profile. `onChanged` lets a list that read the status in
// the browser (the header's people search) read it again, since a refresh doesn't reach it.
export function FollowButton({
  profileId,
  handle,
  isPrivate,
  viewer,
  onChanged,
}: {
  profileId: string;
  handle: string;
  isPrivate: boolean;
  viewer: Viewer | null;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = saving || refreshing;

  if (!viewer) {
    return (
      <Link href={`/login?next=${encodeURIComponent(`/@${handle}`)}`} className={`${LINK_BUTTON} bg-tint text-on-tint shadow-btn hover:bg-tint-pressed`}>
        Follow
      </Link>
    );
  }
  if (viewer.isOwner) {
    return (
      <Link href="/app/settings" className={`${LINK_BUTTON} bg-tint-fill text-tint-text hover:bg-fill`}>
        Edit profile
      </Link>
    );
  }

  const status = viewer.status;

  async function toggle() {
    if (status === "accepted" && isPrivate && !window.confirm(`Unfollow @${handle}? You’ll need to ask again to see their shows.`)) {
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = status
      ? await supabase.from("follows").delete().eq("follower_id", viewer!.id).eq("followee_id", profileId)
      : await supabase.from("follows").insert({ follower_id: viewer!.id, followee_id: profileId });
    // A double tap can race into a duplicate (23505): the follow exists, which
    // is what was asked for.
    if (error && error.code !== "23505") {
      setSaving(false);
      window.alert(
        status === "accepted"
          ? `Couldn’t unfollow @${handle}. Try again.`
          : status
            ? "Couldn’t cancel your request. Try again."
            : `Couldn’t follow @${handle}. Try again.`,
      );
      return;
    }
    onChanged?.();
    // The refreshed page brings the new state; the button stays busy until it lands.
    startRefresh(() => {
      setSaving(false);
      router.refresh();
    });
  }

  const label = status === "accepted" ? "Following" : status === "pending" ? "Requested" : "Follow";
  const hint =
    status === "accepted" ? `Unfollow @${handle}` : status === "pending" ? "Cancel follow request" : undefined;
  return (
    <Button
      size="sm"
      variant={status ? "secondary" : "primary"}
      disabled={busy}
      onClick={toggle}
      title={hint}
    >
      {label}
    </Button>
  );
}

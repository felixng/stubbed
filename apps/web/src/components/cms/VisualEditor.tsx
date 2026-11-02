"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { VisualEditing } from "next-sanity/visual-editing";

export function VisualEditor() {
  const router = useRouter();
  // Studio sends mutation events for drafts. Refresh server-rendered copy
  // through the authenticated preview cookie, without a browser read token.
  const refresh = useCallback(async () => { router.refresh(); }, [router]);
  return <VisualEditing refresh={refresh} />;
}

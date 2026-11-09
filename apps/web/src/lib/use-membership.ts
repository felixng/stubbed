"use client";

import { useEffect, useState } from "react";

import { DEFAULT_CONFIG, PREVIEW_STATE, loadMembership, type MembershipState } from "@/lib/membership";
import { createClient } from "@/lib/supabase/client";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";

// The caller's membership and the rollout switches. Loads when the screen shows, and again each
// time a hidden page is shown (effects re-run with cacheComponents), so coming back after
// upgrading or expiring isn't stale. Call `leave()` when sending the person to the paywall: the
// stale state is dropped on return, so nothing from before the upgrade lingers. `preview` is the
// development override (lib/paywall `previewFree`), which never reads the server.
export function useMembership(preview = false) {
  const [loaded, setLoaded] = useState<MembershipState | null>(null);
  const [failed, setFailed] = useState(false);
  const leave = useFreshOnReturn(() => setLoaded(null));

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    loadMembership(createClient() as never)
      .then((state) => { if (!cancelled) { setLoaded(state); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [preview]);

  const state = preview ? PREVIEW_STATE : loaded;
  return { membership: state?.info ?? null, config: state?.config ?? DEFAULT_CONFIG, ready: state != null, failed, leave };
}

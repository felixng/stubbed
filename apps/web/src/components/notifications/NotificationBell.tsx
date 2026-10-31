"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let active = true;
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      const { data, error } = await createClient().rpc("notification_unread_count");
      if (active && !error) setUnread(data ?? 0);
    }
    void refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("stubbed-notifications", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("stubbed-notifications", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return <Link href="/app/notifications" title="Notifications" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-label hover:bg-fill focus-visible:outline-2 focus-visible:outline-focus">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
    {unread > 0 && <span aria-hidden="true" className="absolute right-2 top-2 size-2 rounded-full bg-tint-text" />}
  </Link>;
}

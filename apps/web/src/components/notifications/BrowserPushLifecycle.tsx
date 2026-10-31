"use client";
import { useEffect } from "react";
import { reconcileBrowserPush } from "@/lib/browser-push";
import { createClient } from "@/lib/supabase/client";
export function BrowserPushLifecycle() {
  useEffect(() => {
    let busy = false;
    let active = true;
    const refresh = async () => {
      if (!active || busy || document.visibilityState !== "visible") return;
      busy = true;
      try { await reconcileBrowserPush(); } catch { /* Settings offers explicit retry. */ }
      finally { busy = false; }
    };
    void refresh();
    const { data } = createClient().auth.onAuthStateChange(() => { setTimeout(() => void refresh(), 0); });
    const timer = setInterval(refresh, 30000);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; data.subscription.unsubscribe(); clearInterval(timer); window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return null;
}

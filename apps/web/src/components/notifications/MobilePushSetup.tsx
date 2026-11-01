"use client";
import { useEffect, useState } from "react";
import { browserPushEligibility, browserPushIdentity, browserPushPermission, rememberBrowserPushRefusal, publicVapidKey, reconcileBrowserPush, registerBrowserSubscription } from "@/lib/browser-push";
import { canRegisterMobilePush, requestMobilePermission, type MobilePushEligibility } from "@/lib/mobile-push";

export function MobilePushSetup() {
  const [platform, setPlatform] = useState<MobilePushEligibility | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [enabled, setEnabled] = useState(false);
  const [worker, setWorker] = useState<ServiceWorkerRegistration | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const publicKey = publicVapidKey(process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const eligibility = browserPushEligibility();
      if (!active) return;
      setPlatform(eligibility);
      if (!canRegisterMobilePush(eligibility)) return;
      try {
        setPermission(browserPushPermission());
        await reconcileBrowserPush();
        // Prepare the worker before the user taps Enable. Permission must be
        // requested directly in that gesture, before any network awaits.
        const registration = await navigator.serviceWorker.register("/notifications-sw.js", { scope: "/", updateViaCache: "none" });
        const ready = await navigator.serviceWorker.ready;
        if (!active) return;
        setWorker(ready);
        const subscription = await registration.pushManager.getSubscription();
        setEnabled(!!subscription && !!browserPushIdentity());
      } catch { if (active) setFailed(true); }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("stubbed-push-state", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); window.removeEventListener("stubbed-push-state", refresh); };
  }, []);
  async function enable() {
    if (!platform || !canRegisterMobilePush(platform) || !worker || !publicKey) return;
    setBusy(true); setFailed(false);
    try {
      const permission = await requestMobilePermission(platform, browserPushPermission(), () => Notification.requestPermission());
      setPermission(permission);
      if (permission !== "granted") { rememberBrowserPushRefusal(); return; }
      const subscription = await worker.pushManager.getSubscription() ?? await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
      await registerBrowserSubscription(worker, subscription);
      setEnabled(true);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }
  if (!platform || platform === "desktop" || platform === "unsupported" || (enabled && permission === "granted" && !failed)) return null;
  return <section className="flex flex-col gap-3 rounded-md border border-separator bg-surface p-4" aria-label="Enable notifications">
    <h2 className="text-headline text-label">Keep up with your activity</h2>
    {platform === "install_ios" && <p className="text-body text-label-secondary">On iOS/iPadOS 16.4 or later: open your browser’s Share menu, choose Add to Home Screen, then open Stubbed from its icon. Return here and tap Enable notifications. No App Store app is needed.</p>}
    {platform && canRegisterMobilePush(platform) && <>
      <p className="text-body text-label-secondary">Get a heads-up about likes, comments and follow activity.</p>
      {platform === "android" && <p className="text-subheadline text-label-secondary">Enable alerts in this browser. You can also add Stubbed to your Home Screen from the browser menu for quick access; no store app or installation is required for supported Android site push.</p>}
      {permission === "denied" ? <p className="text-body text-label-secondary">Change notification permission in browser or system settings. Stubbed won’t prompt again after refusal.</p>
        : publicKey ? <button onClick={enable} disabled={busy || !worker} className="min-h-11 rounded-pill bg-tint-text px-4 py-2 text-white disabled:opacity-50">{busy ? "Enabling…" : "Enable notifications"}</button>
        : <p className="text-subheadline text-label-secondary">Push setup isn’t available yet. Your inbox still works.</p>}
    </>}
    {failed && <p role="alert" className="text-destructive">Couldn’t update browser delivery. Check your connection and reopen this page to retry.</p>}
  </section>;
}

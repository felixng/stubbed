"use client";
import { createClient } from "@/lib/supabase/client";
import { supabaseEnv } from "@/lib/env";
import { canRegisterMobilePush, mobilePushEligibility, effectivePushPermission, pushKeyMatches } from "@/lib/mobile-push";

type Identity = { installation: string; secret: string; owner: string };
const identityKey = "stubbed-push-installation";
const pendingKey = "stubbed-push-cleanup";
const refusalKey = "stubbed-push-refused";
export function browserPushPermission(): NotificationPermission {
  if (Notification.permission === "granted") { localStorage.removeItem(refusalKey); return "granted"; }
  return effectivePushPermission(Notification.permission, localStorage.getItem(refusalKey) === "true");
}
export function rememberBrowserPushRefusal() { localStorage.setItem(refusalKey, "true"); }
export function publicVapidKey(value: string | undefined): Uint8Array<ArrayBuffer> | null {
  if (!value) return null;
  try {
    const bytes = Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")), c => c.charCodeAt(0));
    return bytes.length === 65 && bytes[0] === 4 ? bytes : null;
  } catch { return null; }
}
export function browserPushEligibility() {
  return mobilePushEligibility({ userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints,
    standalone: matchMedia("(display-mode: standalone)").matches || !!(navigator as Navigator & { standalone?: boolean }).standalone,
    secure: window.isSecureContext, serviceWorker: "serviceWorker" in navigator, pushManager: "PushManager" in window, notifications: "Notification" in window });
}
export function browserPushIdentity(): Identity | null {
  try {
    const value = JSON.parse(localStorage.getItem(identityKey) || "null");
    return value && typeof value.installation === "string" && typeof value.secret === "string" && typeof value.owner === "string" ? value : null;
  } catch { return null; }
}
function saveIdentity(identity: Identity) {
  localStorage.setItem(identityKey, JSON.stringify(identity));
  document.cookie = `stubbed_push_installation=${identity.installation}.${identity.secret}; Path=/; Max-Age=31536000; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`;
}
function pendingIdentities(): Identity[] {
  try { const value = JSON.parse(localStorage.getItem(pendingKey) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}
async function workerMessage(registration: ServiceWorkerRegistration, message: unknown) {
  if (!registration.active) return;
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error("Worker unavailable")); }, 3000);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); if (event.data?.error) reject(new Error("Worker unavailable")); else resolve(); };
    registration.active!.postMessage(message, [channel.port2]);
  });
}
export async function flushBrowserPushCleanup() {
  let pending: Identity[];
  try { pending = pendingIdentities(); } catch { return; }
  if (!pending.length) return;
  const { url, key } = supabaseEnv();
  const completed = new Set<string>();
  await Promise.all(pending.map(async identity => {
    try {
      const response = await fetch(`${url}/rest/v1/rpc/remove_push_installation`, { method: "POST", headers: { apikey: key, "content-type": "application/json" }, body: JSON.stringify({ installation: identity.installation, secret: identity.secret }), keepalive: true, signal: AbortSignal.timeout(10000) });
      if (response.ok) completed.add(identity.installation);
    } catch { /* Durable cleanup remains queued for the next foreground visit. */ }
  }));
  // Preserve identities queued while these network requests were in flight.
  const current: Identity[] = pendingIdentities();
  localStorage.setItem(pendingKey, JSON.stringify(current.filter(i => !completed.has(i.installation))));
}
export async function disableBrowserPush() {
  const identity = browserPushIdentity();
  if (identity) {
    const pending: Identity[] = pendingIdentities();
    if (!pending.some(i => i.installation === identity.installation)) pending.push(identity);
    localStorage.setItem(pendingKey, JSON.stringify(pending));
    localStorage.removeItem(identityKey);
  }
  document.cookie = "stubbed_push_installation=; Path=/; Max-Age=0; SameSite=Strict";
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (registration) {
      await workerMessage(registration, { type: "CLEAR_PUSH_CONTEXT" }).catch(() => {});
      const subscription = await registration.pushManager.getSubscription();
      await subscription?.unsubscribe().catch(() => false);
    }
  }
  await flushBrowserPushCleanup();
  window.dispatchEvent(new Event("stubbed-push-state"));
}
export async function registerBrowserSubscription(registration: ServiceWorkerRegistration, subscription: PushSubscription) {
  const platform = browserPushEligibility();
  if (!canRegisterMobilePush(platform) || Notification.permission !== "granted") throw new Error("Mobile permission required");
  const { data, error } = await createClient().auth.getUser();
  if (error || !data.user) throw new Error("Sign in required");
  let identity = browserPushIdentity();
  if (identity && identity.owner !== data.user.id) { await disableBrowserPush(); throw new Error("Enable again for this account"); }
  identity ??= { installation: crypto.randomUUID(), secret: crypto.randomUUID(), owner: data.user.id };
  saveIdentity(identity);
  const json = subscription.toJSON();
  const result = await createClient().rpc("register_browser_push", { installation: identity.installation, secret: identity.secret, endpoint: subscription.endpoint, p256dh: json.keys?.p256dh, auth_key: json.keys?.auth, platform });
  if (result.error) throw new Error("Registration failed");
  // If logout happened during registration, remove the stale destination again.
  if (browserPushIdentity()?.installation !== identity.installation) {
    const pending: Identity[] = pendingIdentities();
    if (!pending.some(i => i.installation === identity!.installation)) pending.push(identity);
    localStorage.setItem(pendingKey, JSON.stringify(pending));
    await flushBrowserPushCleanup();
    return;
  }
  const { url, key } = supabaseEnv();
  await workerMessage(registration, { type: "SET_PUSH_CONTEXT", context: { ...identity, endpoint: subscription.endpoint, supabaseUrl: url, publicKey: key } });
}
export async function reconcileBrowserPush() {
  await flushBrowserPushCleanup();
  const platform = browserPushEligibility();
  // A desktop visit or ordinary iPhone browser tab must never disable a
  // different mobile installation or change account preferences.
  if (!canRegisterMobilePush(platform)) return;
  const identity = browserPushIdentity();
  if (!identity) return;
  if (Notification.permission !== "granted") { rememberBrowserPushRefusal(); await disableBrowserPush(); return; }
  const { data } = await createClient().auth.getUser();
  if (data.user?.id !== identity.owner) { await disableBrowserPush(); return; }
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!registration || !subscription) { await disableBrowserPush(); return; }
  const expectedKey = publicVapidKey(process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY);
  const existingKey = subscription.options.applicationServerKey;
  if (!pushKeyMatches(expectedKey, existingKey)) {
    await disableBrowserPush(); return;
  }
  await registerBrowserSubscription(registration, subscription);
}

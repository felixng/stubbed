/* Mobile Web Push only. No fetch handler or cache of authenticated pages. */
const CONTEXT_DB = "stubbed-push";
function contextStore(write) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(CONTEXT_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore("context");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("context", write ? "readwrite" : "readonly");
      const store = tx.objectStore("context");
      const operation = write ? (write.value === null ? store.delete("installation") : store.put(write.value, "installation")) : store.get("installation");
      let result;
      operation.onsuccess = () => { result = operation.result; };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}
async function matchingSession(owner) {
  if (!owner) return false;
  try {
    const response = await fetch("/api/notifications/session", { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(3000) });
    return response.ok && (await response.json()).user_id === owner;
  } catch { return false; }
}
function safeNotificationUrl(value) {
  return typeof value === "string" && /^\/app\/notifications\/open\/[0-9a-f-]{36}$/i.test(value) ? value : "/app/notifications";
}
self.addEventListener("install", event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });
self.addEventListener("message", event => {
  event.waitUntil((async () => {
    try {
      if (event.data?.type === "SET_PUSH_CONTEXT") await contextStore({ value: event.data.context });
      else if (event.data?.type === "CLEAR_PUSH_CONTEXT") {
        await contextStore({ value: null });
        for (const notification of await self.registration.getNotifications()) notification.close();
      }
      event.ports[0]?.postMessage({ ok: true });
    } catch { event.ports[0]?.postMessage({ error: true }); }
  })());
});
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let alert;
    try { alert = event.data?.json() ?? {}; } catch { alert = {}; }
    const context = await contextStore().catch(() => null);
    const sameAccount = !!context && alert.recipient_id === context.owner && await matchingSession(context.owner);
    // Safari requires visible delivery for every received push. Server policy
    // skips read activity; no duplicate in-app banner is created. If account
    // context changed or cannot be verified, never display a private preview.
    await self.registration.showNotification("Stubbed", {
      body: sameAccount && typeof alert.body === "string" ? alert.body.slice(0, 700) : "Open Stubbed to see your activity.",
      icon: "/brand/icon-192.png",
      tag: sameAccount && typeof alert.id === "string" ? `stubbed-${alert.id}` : "stubbed-activity",
      data: { url: safeNotificationUrl(alert.url) },
    });
  })());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const data = event.notification.data ?? {};
    // The opaque resolver is recipient-authorized server-side and preserves
    // its destination through sign-in. A different account resolves neutrally.
    const path = safeNotificationUrl(data.url);
    const url = new URL(path, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (client) {
      try { const navigated = await client.navigate(url); if (navigated) { await navigated.focus(); return; } } catch { /* Open a new same-origin window below. */ }
    }
    await self.clients.openWindow(url);
  })());
});
self.addEventListener("pushsubscriptionchange", event => {
  event.waitUntil((async () => {
    const context = await contextStore().catch(() => null);
    if (!context) return;
    const endpoint = event.oldSubscription?.endpoint ?? context.endpoint;
    try {
      await fetch(`${context.supabaseUrl}/rest/v1/rpc/remove_browser_push`, {
        method: "POST", headers: { apikey: context.publicKey, "content-type": "application/json" },
        body: JSON.stringify({ installation: context.installation, secret: context.secret, endpoint }), signal: AbortSignal.timeout(10000),
      });
    } catch { /* Foreground reconciliation durably queues cleanup and offers Enable again. */ }
    if (context.endpoint === endpoint) await contextStore({ value: { ...context, owner: null } });
    // No silent re-subscribe or permission prompt without an authenticated app.
  })());
});

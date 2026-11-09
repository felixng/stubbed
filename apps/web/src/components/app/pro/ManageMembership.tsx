"use client";

import { useState } from "react";

import { Button, buttonClass } from "@/components/ui/Button";
import { createRevenueCatClient, webBillingKey } from "@/lib/revenuecat-web";
import { APP_STORE_SUBSCRIPTIONS_URL, type ManageTarget } from "@/lib/web-checkout";

// Manage actions by where the subscription lives. Web: RevenueCat's customer portal link from the
// SDK. App Store: only Apple can change it, so a note and a link. Neither is ever a checkout.
export function ManageMembership({ targets, userId }: { targets: ManageTarget[]; userId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  async function openWeb() {
    const key = webBillingKey();
    if (!key) return setError("Managing isn’t available yet.");
    setOpening(true);
    setError(null);
    try {
      const url = await createRevenueCatClient(key, userId).managementURL();
      if (url) window.location.assign(url);
      else setError("Couldn’t find your management link. Use the link in your receipt email.");
    } catch {
      setError("Couldn’t open the management page. Try again in a moment.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {targets.includes("web") && (
        <div className="flex flex-col items-start gap-2">
          <Button variant="secondary" disabled={opening} onClick={openWeb}>{opening ? "Opening…" : "Manage on the web"}</Button>
          {error && <p role="alert" className="text-footnote text-destructive">{error}</p>}
        </div>
      )}
      {targets.includes("app_store") && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-subheadline text-label-secondary">You subscribe through the App Store on your iPhone. Change or cancel it there.</p>
          <a href={APP_STORE_SUBSCRIPTIONS_URL} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>Manage in the App Store</a>
        </div>
      )}
    </div>
  );
}

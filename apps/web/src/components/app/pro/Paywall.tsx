"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { PlaceholderRows } from "@/components/ui/PlaceholderRows";
import { ProPreview } from "./ProPreview";
import { track } from "@/lib/analytics";
import { isPro, loadMembership } from "@/lib/membership";
import { availablePaywallBenefits, UNAVAILABLE_OFFER, buttonLabel, type PaywallSource } from "@/lib/paywall";
import { createRevenueCatClient, webBillingKey } from "@/lib/revenuecat-web";
import { createClient } from "@/lib/supabase/client";
import { useMembership } from "@/lib/use-membership";
import {
  PurchaseFlow, busy, checkoutAvailable, confirmMembership, termsFor,
  type CheckoutPreview, type LoadedOffer, type Plan, type PurchaseState, type PurchasesClient,
} from "@/lib/web-checkout";

const NONE: LoadedOffer = { offer: UNAVAILABLE_OFFER, plans: [] };

// Development-only stand-in offering for screenshots (?checkoutPreview=trial|standard|…).
function mockClient(trial: boolean): PurchasesClient {
  const plans: Plan[] = [
    { id: "monthly", name: "Monthly", price: "£2.99", period: "month", trial },
    { id: "annual", name: "Annual", price: "£19.99", period: "year", trial },
  ];
  return {
    loadOffer: async () => ({ offer: { available: true, trialEligible: trial, terms: termsFor(plans[1]) }, plans }),
    purchase: async () => "cancelled",
    managementURL: async () => null,
  };
}

// The one paywall page. Offer copy comes from RevenueCat; when membership says Pro it goes on to
// `next`. A purchase is never trusted from the client: only my_membership(), after the server has
// refreshed from RevenueCat, moves the person on, and a success in the URL does nothing.
export function Paywall({ source, next, preview = false, userId, email = null, checkout = null, onClose, onConfirmed }: {
  source: PaywallSource; next: string; preview?: boolean; userId: string; email?: string | null; checkout?: CheckoutPreview | null;
  onClose?: () => void; onConfirmed?: () => void;
}) {
  const router = useRouter();
  const { membership, config, ready, failed, leave } = useMembership(preview);
  const [loaded, setLoaded] = useState<LoadedOffer>(NONE);
  const [planId, setPlanId] = useState<string | null>(null);
  const [state, setState] = useState<PurchaseState>(checkout === "confirming" ? "confirming" : checkout === "timeout" ? "timeout" : "idle");
  const flow = useRef<PurchaseFlow | null>(null);

  const client = useMemo<PurchasesClient | null>(() => {
    if (checkout) return mockClient(checkout !== "standard");
    const key = webBillingKey();
    return key && userId ? createRevenueCatClient(key, userId, email) : null;
  }, [checkout, userId, email]);

  useEffect(() => {
    let cancelled = false;
    (client?.loadOffer() ?? Promise.resolve(NONE))
      .then((o) => { if (!cancelled) { setLoaded(o); setPlanId((id) => id ?? (o.plans.find((p) => p.name === "Annual") ?? o.plans[0])?.id ?? null); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [client]);

  // One event per time the paywall is shown (not in preview: nothing real to measure).
  useEffect(() => {
    if (!preview) void track(createClient(), "paywall_viewed", { source, platform: "web" });
  }, [source, preview]);

  const supabase = useMemo(() => createClient(), []);
  const finish = () => {
    void track(supabase, "purchase_completed", { source, platform: "web" });
    leave();
    if (onConfirmed) onConfirmed();
    else router.replace(next);
  };
  const confirm = () => confirmMembership({
    refresh: () => fetch("/api/billing/refresh", { method: "POST" }),
    read: async () => (await loadMembership(supabase as never)).info,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  });

  function flowFor() {
    if (!flow.current && client) {
      flow.current = new PurchaseFlow({
        client,
        confirm,
        onChange: (s) => { setState(s); if (s === "pro") finish(); },
      });
    }
    return flow.current;
  }

  // Already Pro (maybe from the App Store or another tab): nothing to buy, go on.
  const pro = membership != null && isPro(membership);
  useEffect(() => {
    if (!pro || busy(state) || state === "pro") return;
    leave();
    if (onConfirmed) onConfirmed();
    else router.replace(next);
  }, [pro, state, next, router, leave, onConfirmed]);

  if (failed) return <p role="alert" className="text-subheadline text-label-secondary">Couldn’t check your membership. Try again in a moment.</p>;
  if (!ready || pro) return <PlaceholderRows rows={3} />;

  const available = checkoutAvailable(membership, config, loaded.offer);
  const plan = loaded.plans.find((p) => p.id === planId) ?? null;
  const working = busy(state);
  return (
    <section aria-labelledby="paywall-title" className="flex flex-col gap-6">
      {onClose ? <button type="button" onClick={onClose} className="min-h-11 self-start text-tint-text">Not now</button> : (
      <Link href={next} onClick={leave} className="-mt-2 inline-flex min-h-11 items-center gap-1 self-start text-body text-tint-text focus-visible:outline-2 focus-visible:outline-focus">
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
        Not now
      </Link>
      )}
      <div className="flex flex-col gap-2">
        <h1 id="paywall-title" className="text-balance text-title font-bold tracking-tight">{source === "additional_media" ? "Keep more of the night" : source === "video" ? "Add a video to this memory" : "Look back at every year"}</h1>
        <p className="text-pretty text-body text-label-secondary">Get more from your theatre diary with {config.name}.</p>
      </div>
      <ProPreview thisYear={new Date().getFullYear()} />
      <ul className="flex flex-col divide-y divide-separator rounded-md border border-separator bg-surface shadow-sm">
        {availablePaywallBenefits(config).map((b) => (
          <li key={b.title} className="flex items-start gap-3 px-4 py-3">
            <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" className="mt-px flex-none text-tint-text"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            <span className="flex flex-col">
              <span className="text-headline text-label">{b.title}</span>
              <span className="text-subheadline text-label-secondary">{b.text}</span>
            </span>
          </li>
        ))}
      </ul>
      {available ? (
        <div className="flex flex-col gap-3">
          {loaded.plans.length > 1 && (
            <fieldset disabled={working} className="flex w-full flex-col gap-2">
              <legend className="sr-only">Plan</legend>
              {loaded.plans.map((p) => (
                <label key={p.id} className="flex min-h-16 cursor-pointer items-center gap-3 rounded-md border border-separator bg-surface px-4 py-3 transition-shadow has-[:checked]:border-tint has-[:checked]:ring-1 has-[:checked]:ring-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
                  <input type="radio" name="plan" value={p.id} checked={p.id === planId} onChange={() => setPlanId(p.id)} className="peer sr-only" />
                  <span aria-hidden="true" className="grid size-6 flex-none place-items-center rounded-full border-2 border-outline after:size-2.5 after:rounded-full after:bg-on-tint after:opacity-0 peer-checked:border-tint peer-checked:bg-tint peer-checked:after:opacity-100" />
                  <span className="flex flex-col">
                    <span className="text-headline text-label">{p.name}</span>
                    {p.trial && <span className="text-footnote text-label-secondary">Free trial</span>}
                  </span>
                  <span className="ml-auto flex flex-col items-end">
                    <span className="text-headline text-label tabular-nums">{p.price}</span>
                    <span className="text-footnote text-label-secondary">per {p.period}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {state === "confirming" && <p role="status" className="text-subheadline text-label-secondary">Confirming…</p>}
          {state === "timeout" ? (
            <>
              <p role="status" className="text-subheadline text-label-secondary">Your purchase is still confirming. It’ll unlock as soon as it’s through.</p>
              <Button variant="secondary" className="w-full" onClick={() => { void flowFor()?.retry(); }}>Retry</Button>
            </>
          ) : (
            <Button className="w-full" disabled={working || !plan} onClick={() => { if (plan) void flowFor()?.start(plan.id); }}>
              {state === "purchasing" ? "Opening checkout…" : state === "confirming" ? "Confirming…" : buttonLabel(loaded.offer)}
            </Button>
          )}
          {state === "error" && <p role="alert" className="text-footnote text-destructive">Something went wrong with the payment. You haven’t been charged. Try again.</p>}
          {plan && !working && state !== "timeout" && <p className="text-center text-footnote text-label-secondary">{termsFor(plan)}</p>}
        </div>
      ) : (
        <p role="status" className="rounded-md bg-fill px-4 py-3 text-subheadline text-label-secondary">Upgrades aren’t available yet.</p>
      )}
      <p className="text-center text-footnote text-label-secondary">
        {config.name} renews automatically until you cancel. Cancel any time in Settings › Membership and you keep {config.name} until the end of the period you’ve paid for. By upgrading you agree to the{" "}
        <Link href="/terms" className="text-tint-text underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-focus">Terms of Use</Link> and the{" "}
        <Link href="/privacy" className="text-tint-text underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-focus">Privacy Policy</Link>.
      </p>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { PlaceholderRows } from "@/components/ui/PlaceholderRows";
import { track } from "@/lib/analytics";
import { isPro } from "@/lib/membership";
import { PAYWALL_BENEFITS, UNAVAILABLE_OFFER, buttonLabel, unavailableOfferProvider, type Offer, type PaywallSource } from "@/lib/paywall";
import { createClient } from "@/lib/supabase/client";
import { useMembership } from "@/lib/use-membership";

// The one paywall page. Offer copy comes from the provider (placeholder until checkout, #468); when
// membership says Pro it goes on to `next`. A purchase is never trusted from the client: only
// my_membership() moves the person on.
export function Paywall({ source, next, preview = false }: { source: PaywallSource; next: string; preview?: boolean }) {
  const router = useRouter();
  const { membership, config, ready, failed, leave } = useMembership(preview);
  const [offer, setOffer] = useState<Offer>(UNAVAILABLE_OFFER);

  useEffect(() => {
    let cancelled = false;
    unavailableOfferProvider.load().then((o) => { if (!cancelled) setOffer(o); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // One event per time the paywall is shown (not in preview: nothing real to measure).
  useEffect(() => {
    if (!preview) void track(createClient(), "paywall_viewed", { source, platform: "web" });
  }, [source, preview]);

  const pro = membership != null && isPro(membership);
  useEffect(() => {
    if (!pro) return;
    leave();
    router.replace(next);
  }, [pro, next, router, leave]);

  if (failed) return <p role="alert" className="text-subheadline text-label-secondary">Couldn’t check your membership. Try again in a moment.</p>;
  if (!ready || pro) return <PlaceholderRows rows={3} />;

  const available = offer.available && config.salesEnabled;
  return (
    <section aria-labelledby="paywall-title" className="flex flex-col gap-5">
      <Link href={next} onClick={leave} className="self-start text-subheadline text-tint-text focus-visible:outline-2 focus-visible:outline-focus">Not now</Link>
      <div className="flex flex-col gap-2">
        <h1 id="paywall-title" className="text-large-title font-bold tracking-tight">{config.name}</h1>
        <p className="text-subheadline text-label-secondary">{config.name} adds Show mix, earlier years and All time stats. Logging, your diary, trips and sharing stay free.</p>
      </div>
      <ul className="flex flex-col gap-3 rounded-md border border-separator bg-surface p-4 shadow-sm">
        {PAYWALL_BENEFITS.map((b) => (
          <li key={b.title} className="flex flex-col">
            <span className="text-headline text-label">{b.title}</span>
            <span className="text-subheadline text-label-secondary">{b.text}</span>
          </li>
        ))}
      </ul>
      {available ? (
        <div className="flex flex-col items-start gap-2">
          <Button disabled>{buttonLabel(offer)}</Button>
          {offer.terms && <p className="text-footnote text-label-secondary">{offer.terms}</p>}
        </div>
      ) : (
        <p role="status" className="flex items-center gap-2 text-subheadline text-label-secondary">
          <span aria-hidden="true">⏳</span> Upgrades aren’t available yet
        </p>
      )}
    </section>
  );
}

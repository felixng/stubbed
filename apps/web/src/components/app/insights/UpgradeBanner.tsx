"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { buttonClass } from "@/components/ui/Button";
import { UNAVAILABLE_OFFER, benefitsLine, buttonLabel, paywallHref, unavailableOfferProvider, type Offer, type PaywallSource } from "@/lib/paywall";

// The upgrade banner (the Personal Best pattern from #219). Free content stays above it and it
// sits where the locked section would be: a rounded card with a headline naming the benefit, one
// line on what the plan adds, one primary action and the provider's terms. It links to the one
// paywall page; nothing here blocks the screen, and it never draws the real chart.
export function UpgradeBanner({ headline, source, next, name, preview = false, onLeave }: {
  headline: string; source: PaywallSource; next: string; name: string; preview?: boolean; onLeave?: () => void;
}) {
  const [offer, setOffer] = useState<Offer>(UNAVAILABLE_OFFER);
  useEffect(() => {
    let cancelled = false;
    unavailableOfferProvider.load().then((o) => { if (!cancelled) setOffer(o); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return (
    <section aria-label={`${name}: ${headline}`} data-pro-banner className="flex flex-col items-start gap-3 rounded-lg bg-tint-fill p-5">
      <p className="flex items-center gap-1.5 text-footnote font-semibold text-tint-text">
        <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        {name}
      </p>
      <h3 className="text-title-3 font-display text-label">{headline}</h3>
      <p className="text-subheadline text-label-secondary">{benefitsLine(name)}</p>
      <Link href={paywallHref(source, next, preview)} onClick={onLeave} className={buttonClass("primary", "md")}>{buttonLabel(offer)}</Link>
      {offer.terms && <p className="text-footnote text-label-secondary">{offer.terms}</p>}
    </section>
  );
}

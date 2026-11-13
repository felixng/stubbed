"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { buttonLabel, paywallHref, UNAVAILABLE_OFFER, unavailableOfferProvider, type Offer, type PaywallSource } from "@/lib/paywall";

// The one upgrade banner (the Personal Best pattern from #219, restyled in #497). The same card
// and the same words wherever a stat is locked, so it reads as one invitation, not several. Free
// content stays above it; it never draws the real chart and never blocks the screen. A dark
// Velvet Ink card lit by soft glows in the icon's magenta, coral and amber, white text, and a white
// capsule that links to the one paywall page. The offer's terms sit under the button when the
// provider has them. (Owner's call, 11 Nov 2026: the glow is a deliberate exception to "the sweep
// is never decoration"; see docs/DECISIONS.md.)
export function UpgradeBanner({ source, next, name, preview = false, onLeave }: {
  source: PaywallSource; next: string; name: string; preview?: boolean; onLeave?: () => void;
}) {
  const [offer, setOffer] = useState<Offer>(UNAVAILABLE_OFFER);
  useEffect(() => {
    let cancelled = false;
    unavailableOfferProvider.load().then((o) => { if (!cancelled) setOffer(o); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return (
    <section aria-label={`${name}: unlock all features`} data-pro-banner
      className="relative isolate flex flex-col gap-4 overflow-hidden rounded-lg bg-[#1c1c1e] p-5 text-white">
      <div aria-hidden="true" className="absolute inset-0 -z-10"
        style={{ backgroundImage: "radial-gradient(90% 120% at 0% 0%, rgb(232 36 127 / 0.55), transparent 60%), radial-gradient(70% 100% at 100% 100%, rgb(255 160 64 / 0.42), transparent 62%), radial-gradient(60% 80% at 100% 0%, rgb(255 90 90 / 0.3), transparent 65%)" }} />
      <div className="flex flex-col gap-1">
        <h3 className="text-title-2 font-display">Unlock all features</h3>
        <p className="text-body text-white/85">Get more from your theatre diary with {name}.</p>
      </div>
      <Link href={paywallHref(source, next, preview)} onClick={onLeave}
        className="inline-flex min-h-[50px] items-center justify-center rounded-pill bg-white px-6 text-headline font-semibold text-label transition-colors hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
        {buttonLabel(offer)}
      </Link>
      {offer.terms && <p className="text-center text-footnote text-white/80">{offer.terms}</p>}
    </section>
  );
}

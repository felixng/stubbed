import { getCopy } from "@/lib/cms/content";
import Link from "next/link";

import { buttonClass } from "@/components/ui/Button";
import { LEGAL } from "@/lib/legal";

export async function About() {
  const copy = await getCopy("about");
  return (
    <div className="flex flex-col gap-8">
      <p className="text-body text-label-secondary">
        {copy.stubbedIsATheatreDiaryLog}
      </p>
      <section aria-labelledby="why-i-built-this" className="flex flex-col gap-4 text-body text-label-secondary">
        <h2 id="why-i-built-this" className="font-display text-title-2 text-label">{copy.whyIBuiltThis}</h2>
        <p>
          {copy.hiImFelixImAnIndependent}
        </p>
        <p>
          {copy.forYearsILookedForA}
        </p>
        <p>
          {copy.iWantedAQuietFastTool}
        </p>
        <p>
          {copy.theresNoVCFundingNoGrowth}
        </p>
      </section>
      <section aria-labelledby="get-in-touch" className="flex flex-col gap-3 border-t border-separator pt-6">
        <h2 id="get-in-touch" className="font-display text-title-2 text-label">{copy.builtWithYourFeedback}</h2>
        <p className="text-body text-label-secondary">
          {copy.stubbedIsInPublicBetaIf}{" "}
          <a href={`mailto:${LEGAL.email}`} className="rounded-sm text-tint-text underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{LEGAL.email}</a>.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Link href="/signup" className={buttonClass()}>{copy.signUpFree}</Link>
          <Link href="/faq" className={buttonClass("ghost")}>{copy.readTheFAQAndGuides}</Link>
        </div>
      </section>
    </div>
  );
}

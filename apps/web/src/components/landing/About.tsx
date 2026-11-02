import Link from "next/link";

import { buttonClass } from "@/components/ui/Button";
import { LEGAL } from "@/lib/legal";

export function About() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-body text-label-secondary">
        Stubbed is a theatre diary. Log the shows you see, add a rating, note or
        photo, group visits into trips and share cards with friends. Any theatre,
        anywhere.
      </p>
      <section aria-labelledby="why-i-built-this" className="flex flex-col gap-4 text-body text-label-secondary">
        <h2 id="why-i-built-this" className="font-display text-title-2 text-label">Why I built this</h2>
        <p>
          Hi, I’m Felix. I’m an independent developer based in London, and I go
          to the theatre a lot.
        </p>
        <p>
          For years, I looked for a straightforward way to track what I saw —
          something like Letterboxd, but built specifically for theatre.
          Everything out there was either clunky, abandoned, full of ads, or
          trying to sell me tickets.
        </p>
        <p>
          I wanted a quiet, fast tool to log productions, save programme photos,
          and look back at past shows. So I built Stubbed.
        </p>
        <p>
          There’s no VC funding, no growth hacking, and no ads. Stubbed is just
          software built to do one job well. Your photos have location metadata
          stripped on-device before uploading. CSV export is planned; it isn’t
          available yet.
        </p>
      </section>
      <section aria-labelledby="get-in-touch" className="flex flex-col gap-3 border-t border-separator pt-6">
        <h2 id="get-in-touch" className="font-display text-title-2 text-label">Built with your feedback</h2>
        <p className="text-body text-label-secondary">
          Stubbed is in public beta. If something gets in the way of logging a
          show, or you have an idea, email{" "}
          <a href={`mailto:${LEGAL.email}`} className="rounded-sm text-tint-text underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{LEGAL.email}</a>.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Link href="/signup" className={buttonClass()}>Sign up free</Link>
          <Link href="/faq" className={buttonClass("ghost")}>Read the FAQ and guides</Link>
        </div>
      </section>
    </div>
  );
}

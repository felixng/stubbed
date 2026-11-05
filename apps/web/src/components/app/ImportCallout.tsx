import Link from "next/link";

import { Icon } from "@/components/app/AppTabBar";
import { buttonClass } from "@/components/ui/Button";

// For someone who hasn't logged a show yet (#194): bring in the shows
// they've already seen from photos, or log one. Home and the diary show it
// until the first show is logged (planned ones don't count).
export function ImportCallout() {
  return (
    <section
      aria-labelledby="import-callout"
      className="flex flex-col gap-3 rounded-md border border-separator bg-surface p-5 shadow-sm"
    >
      <h2 id="import-callout" className="flex items-center gap-2 text-headline text-label">
        <span className="text-tint-text">
          <Icon id="import" size={22} />
        </span>
        Bring in the shows you’ve seen
      </h2>
      <p className="text-subheadline text-label-secondary">
        Pick photos from your shows. Coming from Mezzanine? Bring your diary over.
      </p>
      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
        <Link href="/app/import/photos" className={`${buttonClass("primary", "sm")} sm:flex-1`}>
          Import from photos
        </Link>
        <Link href="/app/import/mezzanine" className={`${buttonClass("secondary", "sm")} sm:flex-1`}>
          From Mezzanine
        </Link>
        <Link href="/app/log" className={`${buttonClass("secondary", "sm")} sm:flex-1`}>
          Log a show
        </Link>
      </div>
    </section>
  );
}

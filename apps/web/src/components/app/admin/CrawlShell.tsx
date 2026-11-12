import Link from "next/link";
import { Suspense } from "react";
import { AdminOnly } from "@/components/app/admin/AdminOnly";
import { BackLink } from "@/components/ui/BackLink";
import { CRAWL_GUIDE_PATH } from "@/lib/admin-crawl";

// The frame every crawler page shares: one back link to its parent, a title, and the admin gate.
export function CrawlShell({ back, title, intro, guide = true, children }: {
  back: { href: string; label: string } | React.ReactNode;
  title: string;
  intro?: string;
  guide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1">
        {back && typeof back === "object" && "href" in back && "label" in back ? <BackLink href={back.href}>{back.label}</BackLink> : back}
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="font-display text-title text-label">{title}</h1>
          {guide && <Link href={CRAWL_GUIDE_PATH} className="text-subheadline text-tint-text" aria-label="How the crawler works">? How it works</Link>}
        </div>
        {intro && <p className="text-subheadline text-label-secondary">{intro}</p>}
      </div>
      <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
        <AdminOnly>{children}</AdminOnly>
      </Suspense>
    </section>
  );
}

export const panel = "min-w-0 rounded-md border border-separator bg-surface p-4";

export function Section({ id, title, children, hint }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={`flex flex-col gap-3 ${panel}`}>
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-headline">{title}</h2>
        {hint && <p className="text-footnote text-label-secondary">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

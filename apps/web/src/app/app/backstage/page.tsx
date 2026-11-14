import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminOnly } from "@/components/app/admin/AdminOnly";

export const metadata: Metadata = { title: "Backstage" };

const PAGES = [
  {
    href: "/app/backstage/reports",
    title: "Reports",
    text: "Shows, comments and profiles people have reported. Hide them or dismiss the report.",
  },
  {
    href: "/app/backstage/theatres",
    title: "Theatres",
    text: "Every theatre we hold, how often people log at it, and which have no website or what’s-on link.",
  },
  {
    href: "/app/backstage/shows",
    title: "Shows",
    text: "The show list users search: check pasted titles against it, and spot typed-in shows that look wrong or duplicated.",
  },
  {
    href: "/app/backstage/crawl",
    title: "Catalogue crawler",
    text: "Where the crawler is and what needs you: sources, progress, publishing, suggestions to members, and official-sites runs and review.",
  },
  {
    href: "/app/backstage/membership",
    title: "Membership",
    text: "Look up someone’s Pro membership, re-sync it from RevenueCat, and check billing is set up.",
  },
  {
    href: "/dressingroom",
    title: "Dressing room",
    text: "Edit the words on the landing page, FAQ, press kit and other public pages.",
  },
];

// Admin pages (see lib/admin). Nothing in the rest of the app links here, so
// an admin sees the app as any user does; open /app/backstage directly.
export default function AdminPage() {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-title font-display text-label">Backstage</h1>
        <p className="text-subheadline text-label-secondary">Only admins can open these pages. The rest of the app is the same for everyone.</p>
      </div>
      <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
        <AdminOnly>
          <ul className="overflow-hidden rounded-md border border-separator bg-surface shadow-sm">
            {PAGES.map((p) => (
              <li key={p.href} className="border-b border-separator last:border-b-0">
                {/* The editor is its own app outside /app, so it needs a full page load. */}
                <Link
                  href={p.href}
                  prefetch={p.href.startsWith("/app/")}
                  className="flex flex-col gap-0.5 px-4 py-3 hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                >
                  <span className="text-headline text-label">{p.title}</span>
                  <span className="text-footnote text-label-secondary">{p.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </AdminOnly>
      </Suspense>
    </section>
  );
}

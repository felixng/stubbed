import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminOnly } from "@/components/app/admin/AdminOnly";

export const metadata: Metadata = { title: "Admin" };

const PAGES = [
  {
    href: "/app/admin/reports",
    title: "Reports",
    text: "Shows, comments and profiles people have reported. Hide them or dismiss the report.",
  },
  {
    href: "/app/admin/theatres",
    title: "Theatres",
    text: "Every theatre we hold, how often people log at it, and which have no website or what’s-on link.",
  },
  {
    href: "/app/admin/shows",
    title: "Shows",
    text: "The show list users search: check pasted titles against it, and spot typed-in shows that look wrong or duplicated.",
  },
  {
    href: "/app/admin/crawl",
    title: "Crawl runs",
    text: "What the crawler read from theatre websites: check findings, mark them right or wrong, and compare runs.",
  },
];

// Admin pages (see lib/admin). Nothing in the rest of the app links here, so
// an admin sees the app as any user does; open /app/admin directly.
export default function AdminPage() {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-title font-display text-label">Admin</h1>
        <p className="text-subheadline text-label-secondary">Only admins can open these pages. The rest of the app is the same for everyone.</p>
      </div>
      <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
        <AdminOnly>
          <ul className="overflow-hidden rounded-md border border-separator bg-surface shadow-sm">
            {PAGES.map((p) => (
              <li key={p.href} className="border-b border-separator last:border-b-0">
                <Link
                  href={p.href}
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

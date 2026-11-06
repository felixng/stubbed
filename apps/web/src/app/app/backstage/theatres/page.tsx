import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminOnly } from "@/components/app/admin/AdminOnly";
import { EditTheatre } from "@/components/app/admin/EditTheatre";
import { BackLink } from "@/components/ui/BackLink";
import { buttonClass } from "@/components/ui/Button";
import { CIRCUITS, PAGE_SIZE, filterArgs, parseTheatreFilters, theatresHref } from "@/lib/admin-theatres";
import { ownerContext } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Theatres" };

type Venue = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  circuit: string | null;
  website: string | null;
  whats_on_url: string | null;
  entry_count: number;
};

type Totals = { venues: number; labelled: number; with_website: number; with_whats_on: number; logged_at: number };

const FIELD =
  "min-h-11 rounded-md border border-separator bg-surface px-3 text-body text-label focus-visible:outline-2 focus-visible:outline-focus";

const TRI = [
  { value: "", label: "Any" },
  { value: "has", label: "Has one" },
  { value: "lacks", label: "Missing" },
];

function Missing({ children }: { children: React.ReactNode }) {
  return <span className="rounded-pill bg-fill px-2 py-0.5 text-footnote font-semibold text-label-secondary">{children}</span>;
}

// Read with the admin's session through admin_list_venues (admins only; it
// returns counts, never who logged what). Filters live in the query string, so
// a filtered list is a link.
async function Theatres({ searchParams }: Pick<PageProps<"/app/backstage/theatres">, "searchParams">) {
  const f = parseTheatreFilters(await searchParams);
  const { supabase } = await ownerContext();
  const args = filterArgs(f);
  const [list, totals] = await Promise.all([
    supabase.rpc("admin_list_venues", { ...args, page_size: PAGE_SIZE + 1, page_offset: (f.page - 1) * PAGE_SIZE }),
    supabase.rpc("admin_venue_totals", args),
  ]);
  const rows = (list.data ?? []) as unknown as Venue[];
  const more = rows.length > PAGE_SIZE;
  const venues = rows.slice(0, PAGE_SIZE);
  const t = ((totals.data ?? []) as unknown as Totals[])[0];

  return (
    <>
      <form method="get" className="flex flex-col gap-3 rounded-md border border-separator bg-surface p-4 shadow-sm">
        <input name="q" defaultValue={f.q} placeholder="Theatre or city" aria-label="Theatre or city" className={FIELD} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-footnote text-label-secondary">
            Circuit
            <select name="circuit" defaultValue={f.circuit} className={FIELD}>
              <option value="">Any</option>
              {CIRCUITS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-footnote text-label-secondary">
            Country
            <input name="country" defaultValue={f.country} placeholder="GB" maxLength={2} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-footnote text-label-secondary">
            Website
            <select name="website" defaultValue={f.website} className={FIELD}>
              {TRI.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-footnote text-label-secondary">
            What’s-on link
            <select name="whats_on" defaultValue={f.whatsOn} className={FIELD}>
              {TRI.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={buttonClass("primary", "sm")}>
            Show theatres
          </button>
          <Link href="/app/backstage/theatres" className={buttonClass("ghost", "sm")}>
            Clear
          </Link>
        </div>
      </form>

      {t && (
        <p className="text-subheadline text-label-secondary">
          <span className="font-semibold text-label">{t.venues.toLocaleString("en-GB")}</span> theatres ·{" "}
          {t.labelled.toLocaleString("en-GB")} with a circuit · {t.with_website.toLocaleString("en-GB")} with a website ·{" "}
          {t.with_whats_on.toLocaleString("en-GB")} with a what’s-on link · {t.logged_at.toLocaleString("en-GB")} logged at
        </p>
      )}

      {list.error ? (
        <p className="text-subheadline text-label-secondary">Couldn’t load theatres: {list.error.message}</p>
      ) : venues.length === 0 ? (
        <p className="text-subheadline text-label-secondary">No theatres match.</p>
      ) : (
        <ul className="overflow-hidden rounded-md border border-separator bg-surface shadow-sm">
          {venues.map((v) => (
            <li key={v.id} className="flex flex-col gap-1.5 border-b border-separator px-4 py-3 last:border-b-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-headline break-words text-label">{v.name}</span>
                <span className="shrink-0 text-footnote text-label-secondary">
                  {v.entry_count} {v.entry_count === 1 ? "entry" : "entries"}
                </span>
              </div>
              <p className="text-footnote text-label-secondary">
                {[v.city, v.country, CIRCUITS.find((c) => c.value === v.circuit)?.label].filter(Boolean).join(" · ") || "No location"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {v.website ? (
                  <a
                    href={v.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center rounded-pill px-3 text-subheadline font-semibold text-tint-text hover:bg-tint-fill"
                  >
                    Website
                  </a>
                ) : (
                  <Missing>No website</Missing>
                )}
                {v.whats_on_url ? (
                  <a
                    href={v.whats_on_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center rounded-pill px-3 text-subheadline font-semibold text-tint-text hover:bg-tint-fill"
                  >
                    What’s on
                  </a>
                ) : (
                  <Missing>No what’s-on link</Missing>
                )}
                {!v.circuit && <Missing>No circuit</Missing>}
                <EditTheatre key={`${v.id}${v.website}${v.whats_on_url}${v.circuit}`} id={v.id} website={v.website} whatsOn={v.whats_on_url} circuit={v.circuit} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {(f.page > 1 || more) && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pages">
          {f.page > 1 ? (
            <Link href={theatresHref(f, f.page - 1)} className={buttonClass("secondary", "sm")}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-footnote text-label-secondary">Page {f.page}</span>
          {more ? (
            <Link href={theatresHref(f, f.page + 1)} className={buttonClass("secondary", "sm")}>
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}

export default function AdminTheatresPage({ searchParams }: PageProps<"/app/backstage/theatres">) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <BackLink href="/app/backstage">Backstage</BackLink>
        <h1 className="text-title font-display text-label">Theatres</h1>
        <p className="text-subheadline text-label-secondary">
          Every theatre we hold, the ones people log at first. Filter to “Website: Missing” to see what to fill in.
        </p>
      </div>
      <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
        <AdminOnly>
          <Theatres searchParams={searchParams} />
        </AdminOnly>
      </Suspense>
    </section>
  );
}

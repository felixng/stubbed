import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminOnly } from "@/components/app/admin/AdminOnly";
import { CheckShowNames } from "@/components/app/admin/CheckShowNames";
import { EditShow } from "@/components/app/admin/EditShow";
import { BackLink } from "@/components/ui/BackLink";
import { buttonClass } from "@/components/ui/Button";
import { PAGE_SIZE, SHOW_TYPES, parseShowFilters, showFilterArgs, showsHref } from "@/lib/admin-shows";
import { ownerContext } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Shows" };

type Show = {
  id: string;
  title: string;
  type: string;
  wikidata_id: string | null;
  first_performed: number | null;
  entry_count: number;
  problem: string | null;
  other_id: string | null;
  other_title: string | null;
};

type Totals = { shows: number; from_wikidata: number; typed_in: number; typed_in_logged: number; no_entries: number; with_problems: number };

const FIELD =
  "min-h-11 rounded-md border border-separator bg-surface px-3 text-body text-label focus-visible:outline-2 focus-visible:outline-focus";

const n = (x: number) => x.toLocaleString("en-GB");

// Read with the admin's session through admin_list_shows (admins only; counts,
// never who logged what). Typed-in shows people have logged come first: those
// are the names users see. Filters live in the query string.
async function Shows({ searchParams }: Pick<PageProps<"/app/backstage/shows">, "searchParams">) {
  const f = parseShowFilters(await searchParams);
  const { supabase } = await ownerContext();
  const args = showFilterArgs(f);
  const [list, totals] = await Promise.all([
    supabase.rpc("admin_list_shows", { ...args, page_size: PAGE_SIZE + 1, page_offset: (f.page - 1) * PAGE_SIZE }),
    supabase.rpc("admin_show_totals", args),
  ]);
  const rows = (list.data ?? []) as unknown as Show[];
  const more = rows.length > PAGE_SIZE;
  const shows = rows.slice(0, PAGE_SIZE);
  const t = ((totals.data ?? []) as unknown as Totals[])[0];

  return (
    <>
      <Link href="/app/backstage/shows/candidates" className="rounded-md border border-separator bg-surface px-4 py-3 shadow-sm hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus">
        <span className="block text-headline text-label">Show candidates</span>
        <span className="block text-footnote text-label-secondary">Names pulled from Wikidata, to review and add, one at a time or after checking a sample.</span>
      </Link>
      <CheckShowNames />

      <form method="get" className="flex flex-col gap-3 rounded-md border border-separator bg-surface p-4 shadow-sm">
        <input name="q" defaultValue={f.q} placeholder="Show title" aria-label="Show title" className={FIELD} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-footnote text-label-secondary">
            Type
            <select name="type" defaultValue={f.type} className={FIELD}>
              <option value="">Any</option>
              {SHOW_TYPES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-footnote text-label-secondary">
            From
            <select name="source" defaultValue={f.source} className={FIELD}>
              <option value="">Anywhere</option>
              <option value="wikidata">Wikidata</option>
              <option value="typed">Typed in</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-footnote text-label-secondary">
            Entries
            <select name="entries" defaultValue={f.entries} className={FIELD}>
              <option value="">Any</option>
              <option value="has">Logged by someone</option>
              <option value="none">None yet</option>
            </select>
          </label>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-subheadline text-label">
          <input type="checkbox" name="problems" value="1" defaultChecked={f.problems} className="size-5" />
          Only likely problems (same title, or close to another show)
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={buttonClass("primary", "sm")}>
            Show shows
          </button>
          <Link href="/app/backstage/shows" className={buttonClass("ghost", "sm")}>
            Clear
          </Link>
        </div>
      </form>

      {t && (
        <p className="text-subheadline text-label-secondary">
          <span className="font-semibold text-label">{n(t.shows)}</span> shows · {n(t.from_wikidata)} from Wikidata · {n(t.typed_in)} typed in (
          {n(t.typed_in_logged)} logged) · {n(t.no_entries)} with no entries · {n(t.with_problems)} likely problems
        </p>
      )}

      {list.error ? (
        <p className="text-subheadline text-label-secondary">Couldn’t load shows: {list.error.message}</p>
      ) : shows.length === 0 ? (
        <p className="text-subheadline text-label-secondary">No shows match.</p>
      ) : (
        <ul className="overflow-hidden rounded-md border border-separator bg-surface shadow-sm">
          {shows.map((s) => (
            <li key={s.id} className="flex flex-col gap-1 border-b border-separator px-4 py-3 last:border-b-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-headline break-words text-label">{s.title}</span>
                <span className="shrink-0 text-footnote text-label-secondary">
                  {s.entry_count} {s.entry_count === 1 ? "entry" : "entries"}
                </span>
              </div>
              <p className="text-footnote text-label-secondary">
                {s.type}
                {s.first_performed ? ` · ${s.first_performed}` : ""} · {s.wikidata_id ? `Wikidata ${s.wikidata_id}` : "Typed in"}
              </p>
              {s.problem && (
                <p className="text-footnote font-semibold text-label">
                  {s.problem}
                  {s.other_title ? `: “${s.other_title}”` : ""}
                </p>
              )}
              <EditShow key={`${s.id}${s.title}${s.type}`} id={s.id} title={s.title} type={s.type} otherId={s.wikidata_id ? null : s.other_id} otherTitle={s.other_title} />
            </li>
          ))}
        </ul>
      )}

      {(f.page > 1 || more) && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pages">
          {f.page > 1 ? (
            <Link href={showsHref(f, f.page - 1)} className={buttonClass("secondary", "sm")}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-footnote text-label-secondary">Page {f.page}</span>
          {more ? (
            <Link href={showsHref(f, f.page + 1)} className={buttonClass("secondary", "sm")}>
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

export default function AdminShowsPage({ searchParams }: PageProps<"/app/backstage/shows">) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <BackLink href="/app/backstage">Backstage</BackLink>
        <h1 className="text-title font-display text-label">Shows</h1>
        <p className="text-subheadline text-label-secondary">
          The show list users search. Paste titles to see what a user would get, or filter to typed-in shows people have logged.
        </p>
      </div>
      <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
        <AdminOnly>
          <Shows searchParams={searchParams} />
        </AdminOnly>
      </Suspense>
    </section>
  );
}

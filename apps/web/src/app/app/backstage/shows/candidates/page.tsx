import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminOnly } from "@/components/app/admin/AdminOnly";
import { CandidateActions } from "@/components/app/admin/CandidateActions";
import { CandidateBulk } from "@/components/app/admin/CandidateBulk";
import { BackLink } from "@/components/ui/BackLink";
import { buttonClass } from "@/components/ui/Button";
import { PAGE_SIZE, STATUSES, bulkStatus, candidateHref, parseCandidateFilters, type SampleScore } from "@/lib/admin-candidates";
import { SHOW_TYPES } from "@/lib/admin-shows";
import { ownerContext } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Show candidates" };

type Candidate = {
  id: string;
  title: string;
  type: string;
  first_performed: number | null;
  aliases: string[];
  source: string;
  source_ref: string;
  source_url: string | null;
  venue_name: string | null;
  seen_count: number;
  status: string;
  match_id: string | null;
  match_title: string | null;
  match_type: string | null;
  match_same: boolean | null;
};
type Totals = { candidates: number; pending: number; added: number; same: number; rejected: number };

const FIELD =
  "min-h-11 rounded-md border border-separator bg-surface px-3 text-body text-label focus-visible:outline-2 focus-visible:outline-focus";
const n = (x: number) => x.toLocaleString("en-GB");

async function Candidates({ searchParams }: Pick<PageProps<"/app/backstage/shows/candidates">, "searchParams">) {
  const f = parseCandidateFilters(await searchParams);
  const { supabase } = await ownerContext();
  const [list, totals, score] = await Promise.all([
    supabase.rpc("admin_list_candidates", {
      q: f.q || null, in_type: f.type || null, in_status: f.status === "all" ? null : f.status,
      in_sample: f.sample || null, page_size: PAGE_SIZE + 1, page_offset: (f.page - 1) * PAGE_SIZE,
    }),
    supabase.rpc("admin_candidate_totals", { q: f.q || null, in_type: f.type || null, in_sample: null }),
    f.sample ? supabase.rpc("admin_candidate_sample_score", { sample: f.sample }) : Promise.resolve({ data: null }),
  ]);
  const rows = (list.data ?? []) as unknown as Candidate[];
  const more = rows.length > PAGE_SIZE;
  const candidates = rows.slice(0, PAGE_SIZE);
  const t = ((totals.data ?? []) as unknown as Totals[])[0];
  const sampleScore = (score.data ?? null) as unknown as SampleScore | null;
  const bulk = bulkStatus(f.sample ? sampleScore : null);

  return (
    <>
      <form method="get" className="flex flex-col gap-3 rounded-md border border-separator bg-surface p-4 shadow-sm">
        <input name="q" defaultValue={f.q} placeholder="Name" aria-label="Name" className={FIELD} />
        <div className="grid grid-cols-2 gap-3">
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
            Status
            <select name="status" defaultValue={f.status} className={FIELD}>
              {STATUSES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
              <option value="all">all</option>
            </select>
          </label>
        </div>
        {f.sample && <input type="hidden" name="sample" value={f.sample} />}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={buttonClass("primary", "sm")}>
            Show candidates
          </button>
          <Link href="/app/backstage/shows/candidates" className={buttonClass("ghost", "sm")}>
            Clear
          </Link>
        </div>
      </form>

      {t && (
        <p className="text-subheadline text-label-secondary">
          <span className="font-semibold text-label">{n(t.candidates)}</span> names · {n(t.pending)} pending · {n(t.added)} added · {n(t.same)} same as a show ·{" "}
          {n(t.rejected)} not shows
        </p>
      )}

      <CandidateBulk
        q={f.q}
        type={f.type}
        sample={f.sample}
        pendingInGroup={t?.pending ?? 0}
        canAdd={bulk.ok}
        scoreMessage={f.sample ? `Sample: ${bulk.message}` : null}
      />
      {f.sample && (
        <p className="text-footnote text-label-secondary">
          Showing the sample only.{" "}
          <Link href={candidateHref({ ...f, sample: "" }, 1)} className="font-semibold text-tint-text">
            Show the whole group
          </Link>
        </p>
      )}

      {list.error ? (
        <p className="text-subheadline text-label-secondary">Couldn’t load candidates: {list.error.message}</p>
      ) : candidates.length === 0 ? (
        <p className="text-subheadline text-label-secondary">
          {t && t.candidates === 0 ? "No candidates yet. Pull some with node supabase/scripts/sync-wikidata.mjs --candidates." : "No candidates match."}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-md border border-separator bg-surface shadow-sm">
          {candidates.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 border-b border-separator px-4 py-3 last:border-b-0">
              <div className="flex flex-col gap-0.5">
                <span className="text-headline break-words text-label">{c.title}</span>
                <span className="text-footnote text-label-secondary">
                  {c.type}
                  {c.first_performed ? ` · ${c.first_performed}` : ""} · seen {c.seen_count}×
                  {c.source === "crawler" && <>{" · "}from the crawl{c.venue_name ? ` at ${c.venue_name}` : ""}</>}
                  {c.source_url && (
                    <>
                      {" · "}
                      <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-tint-text">
                        {c.source === "crawler" ? "Source page" : c.source_ref}
                      </a>
                    </>
                  )}
                </span>
                {c.aliases.length > 0 && <span className="text-footnote break-words text-label-secondary">Also: {c.aliases.slice(0, 4).join(", ")}</span>}
                {c.match_title && c.status === "pending" && (
                  <span className="text-footnote font-semibold text-label">
                    {c.match_same ? "Reads as the same show as" : "Close to"} “{c.match_title}” ({c.match_type})
                  </span>
                )}
                {c.status !== "pending" && <span className="text-footnote font-semibold text-label">{c.status === "added" ? "Added as a show" : c.status === "same" ? "Linked to an existing show" : "Not a show"}</span>}
              </div>
              {c.status === "pending" && <CandidateActions key={c.id} id={c.id} matchId={c.match_id} matchTitle={c.match_title} matchSame={Boolean(c.match_same)} />}
            </li>
          ))}
        </ul>
      )}

      {(f.page > 1 || more) && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pages">
          {f.page > 1 ? (
            <Link href={candidateHref(f, f.page - 1)} className={buttonClass("secondary", "sm")}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-footnote text-label-secondary">Page {f.page}</span>
          {more ? (
            <Link href={candidateHref(f, f.page + 1)} className={buttonClass("secondary", "sm")}>
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

export default function AdminCandidatesPage({ searchParams }: PageProps<"/app/backstage/shows/candidates">) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <BackLink href="/app/backstage/shows">Shows</BackLink>
        <h1 className="text-title font-display text-label">Show candidates</h1>
        <p className="text-subheadline text-label-secondary">
          Names from Wikidata and from crawled what’s-on pages that aren’t in the show list yet. Nothing here appears in search until you add it.
        </p>
      </div>
      <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
        <AdminOnly>
          <Candidates searchParams={searchParams} />
        </AdminOnly>
      </Suspense>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminOnly } from "@/components/app/admin/AdminOnly";
import { ResolveReport } from "@/components/app/admin/ResolveReport";
import { BackLink } from "@/components/ui/BackLink";
import { REPORT_REASONS } from "@/lib/moderation";
import { ownerContext } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Reports" };

type Report = {
  id: string;
  target_type: "entry" | "comment" | "profile";
  target_id: string;
  snapshot: string | null;
  reason: string;
  note: string | null;
  created_at: string;
  reporter: { handle: string } | null;
  owner: { handle: string } | null;
};

const PERSON = "handle";

// A fixed time rather than "2h ago": Date.now() isn't allowed while rendering here.
const WHEN = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

// Open reports, oldest first, read with the admin's session (RLS: admins
// only). Hide deletes a comment, or makes a show or profile private; Dismiss
// leaves it. Either resolves every open report about the same thing.
async function Reports() {
  const { supabase } = await ownerContext();
  const { data } = await supabase
    .from("reports")
    .select(
      `id, target_type, target_id, snapshot, reason, note, created_at,
       reporter:profiles!reports_reporter_id_fkey(${PERSON}), owner:profiles!reports_target_owner_fkey(${PERSON})`,
    )
    .is("resolved_at", null)
    .order("created_at", { ascending: true });
  const reports = (data ?? []) as unknown as Report[];
  if (reports.length === 0) return <p className="text-subheadline text-label-secondary">No open reports.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {reports.map((r) => (
        <li key={r.id} className="flex flex-col gap-2 rounded-md border border-separator bg-surface p-4 shadow-sm">
          <p className="text-footnote text-label-secondary">
            <span className="font-semibold text-label">{REPORT_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason}</span>
            {" · "}a {r.target_type === "entry" ? "show" : r.target_type}
            {r.owner && <> by @{r.owner.handle}</>}
            {" · "}reported by @{r.reporter?.handle ?? "deleted"} on{" "}
            <time dateTime={r.created_at}>{WHEN.format(new Date(r.created_at))} UTC</time>
          </p>
          {r.snapshot && <p className="text-body break-words whitespace-pre-line text-label">{r.snapshot}</p>}
          {r.note && <p className="text-subheadline text-label-secondary">“{r.note}”</p>}
          <div className="flex flex-wrap items-center gap-2">
            <TargetLink report={r} />
            <ResolveReport reportId={r.id} hideLabel={r.target_type === "comment" ? "Delete comment" : "Make private"} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function TargetLink({ report }: { report: Report }) {
  const href =
    report.target_type === "entry" ? `/e/${report.target_id}` : report.target_type === "profile" && report.owner ? `/@${report.owner.handle}` : null;
  if (!href) return null;
  return (
    <Link href={href} className="inline-flex min-h-11 items-center rounded-pill px-3 text-subheadline font-semibold text-tint-text hover:bg-tint-fill">
      Open
    </Link>
  );
}

export default function AdminReportsPage() {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <BackLink href="/app/backstage">Backstage</BackLink>
        <h1 className="text-title font-display text-label">Reports</h1>
        <p className="text-subheadline text-label-secondary">
          Shows, comments and profiles people have reported. Act within a day: App Review expects it.
        </p>
      </div>
      <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
        <AdminOnly>
          <Reports />
        </AdminOnly>
      </Suspense>
    </section>
  );
}

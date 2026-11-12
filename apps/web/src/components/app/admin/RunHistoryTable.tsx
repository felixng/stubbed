import Link from "next/link";
import { runPath } from "@/lib/admin-crawl";
import { clock, dayOf, durationText, pagesText, publishedRunDates, stopReasonText, triggerLabel, type WorkerRun } from "@/lib/crawl-schedule";

const viaShort = (via: WorkerRun["started_via"]) => (via === "supabase" ? "Supabase" : via === "github_schedule" ? "GitHub" : null);

const th = "py-2 pr-3 text-footnote font-semibold text-label-secondary";

// Every crawl worker run, newest first. Starting by schedule, by hand or with Start a crawl all leave a row.
export function RunHistoryTable({ runs }: { runs: WorkerRun[] }) {
  if (runs.length === 0) return <p className="text-subheadline text-label-secondary">No runs recorded yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-left text-subheadline">
        <thead>
          <tr>
            <th className={th}>Started</th><th className={th}>By</th><th className={th}>Took</th><th className={th}>Pages</th>
            <th className={th}>Published</th><th className={th}>Ended</th><th className={th}>Log</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-separator align-top">
          {runs.map(run => {
            const official = run.per_source?.official as { run_id?: string } | undefined;
            const published = publishedRunDates(run.per_source);
            return (
              <tr key={run.id}>
                <td className="py-2 pr-3 whitespace-nowrap">{dayOf(run.started_at)}, {clock(run.started_at)}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{triggerLabel(run.trigger)}{viaShort(run.started_via) && <span className="block text-footnote text-label-secondary">via {viaShort(run.started_via)}</span>}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{run.interrupted ? "Interrupted" : durationText(run.started_at, run.finished_at)}</td>
                <td className="py-2 pr-3">{pagesText(run.per_source)}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{published > 0 ? `${published.toLocaleString("en-GB")} run dates` : "None"}</td>
                <td className="py-2 pr-3">{stopReasonText(run.stop_reason, Boolean(run.interrupted))}</td>
                <td className="py-2">
                  <span className="flex flex-col">
                    {run.log_url ? <a href={run.log_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-tint-text">Log</a> : <span className="text-label-secondary">None</span>}
                    {official?.run_id && <Link href={runPath(official.run_id)} className="text-footnote text-tint-text">Official-site run</Link>}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

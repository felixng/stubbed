import { CrawlSourceControl } from "@/components/app/admin/CrawlSourceControl";
import { panel } from "@/components/app/admin/CrawlShell";
import { nextActionText } from "@/lib/crawl-schedule";
import {
  CRAWL_STATUS_LABELS, summariseCrawlShow, summariseCrawlTask,
  type CrawlPage, type CrawlShowResult, type CrawlTaskResult, type TaskTone,
} from "@/lib/admin-crawl";

const time = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
function timestamp(value: string) {
  return `${time.format(new Date(value))} UTC`;
}

const tones: Record<TaskTone, string> = {
  good: "bg-fill text-label",
  waiting: "bg-tint-fill text-tint-text",
  bad: "bg-fill text-destructive",
  neutral: "bg-fill text-label-secondary",
};
const marks: Record<TaskTone, string> = { good: "✓", waiting: "…", bad: "✕", neutral: "·" };

const SHOWS_SHOWN = 6;

function ShowLine({ show }: { show: CrawlShowResult }) {
  const line = summariseCrawlShow(show);
  return (
    <li className="flex gap-2">
      <span aria-hidden className={line.mark === "✕" ? "text-destructive" : "text-label-secondary"}>{line.mark}</span>
      <span className="min-w-0 break-words"><span className="font-semibold">{line.title}</span> <span className="text-label-secondary">· {line.detail}</span></span>
    </li>
  );
}

export function CrawlPageRow({ row, result, known, source, canFix }: { row: CrawlPage; result?: CrawlTaskResult; known: boolean; source: string; canFix: boolean }) {
  const summary = summariseCrawlTask(row, result, known);
  return (
    <li className={`flex flex-col gap-2 ${panel}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 break-words text-subheadline font-semibold">{summary.title}</p>
        <span className={`rounded-pill px-2 py-1 text-footnote font-semibold ${tones[summary.outcome.tone]}`}>
          {marks[summary.outcome.tone]} {summary.outcome.label}
        </span>
      </div>
      {summary.got.length > 0 && <p className="text-subheadline">{summary.got.join(" · ")}</p>}
      {result?.shows && result.shows.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-footnote font-semibold text-label-secondary">Shows listed</p>
          <ul className="flex flex-col gap-0.5 text-subheadline">
            {result.shows.slice(0, SHOWS_SHOWN).map((show, i) => <ShowLine key={i} show={show} />)}
          </ul>
          {result.shows.length > SHOWS_SHOWN && (
            <details className="text-footnote text-label-secondary">
              <summary className="min-h-6 cursor-pointer">Show {result.shows.length - SHOWS_SHOWN} more</summary>
              <ul className="mt-1 flex flex-col gap-0.5 text-subheadline text-label">
                {result.shows.slice(SHOWS_SHOWN).map((show, i) => <ShowLine key={i} show={show} />)}
              </ul>
            </details>
          )}
        </div>
      )}
      {summary.missing.length > 0 && <p className="text-footnote text-destructive">Missing: {summary.missing.join(", ")}</p>}
      {row.status !== "succeeded" && row.last_error && <p className="break-words text-footnote">{row.last_error}</p>}
      <p className="text-footnote text-label-secondary">{nextActionText(row)}</p>
      <details className="text-footnote text-label-secondary">
        <summary className="min-h-6 cursor-pointer">Details</summary>
        <div className="mt-1 flex flex-col gap-1">
          <a href={row.canonical_url} target="_blank" rel="noreferrer" className="break-all text-tint-text">{row.canonical_url}</a>
          <p>Status: {CRAWL_STATUS_LABELS[row.status]}</p>
          <p>{row.attempts} {row.attempts === 1 ? "attempt" : "attempts"} · {row.http_requests} HTTP requests · Parser {row.parser_version ?? "pending"}</p>
          {row.last_success_at && <p>Last read {timestamp(row.last_success_at)}</p>}
          {row.last_error && row.status === "succeeded" && <p className="break-words">Last error: {row.last_error}</p>}
          <p>“Read again” fetches this page afresh. Use it after a parser fix to check the page.</p>
        </div>
      </details>
      {canFix && row.generation_id && (
        <div className="flex flex-wrap gap-2">
          {row.status === "blocked" ? <CrawlSourceControl source={source} operation="retry_blocked" scan={row.generation_id} task={row.id} />
            : (row.status === "failed" || row.status === "retry_wait") &&
              <CrawlSourceControl source={source} operation="retry_failed" scan={row.generation_id} task={row.id} />}
          {row.status !== "blocked" && row.parser_version &&
            <CrawlSourceControl source={source} operation="reparse" scan={row.generation_id} task={row.id} />}
        </div>
      )}
    </li>
  );
}

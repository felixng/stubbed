import { Section } from "@/components/app/admin/CrawlShell";
import {
  CRON_MINUTES, clock, dispatchText, durationText, nextRunAfter, nextRunPlan, pagesText, runAllowance, scheduleAlert, stopReasonText, todaysLimits,
  triggerLabel, viaLabel, type CrawlDispatch, type CrawlSchedule,
} from "@/lib/crawl-schedule";
import { crawlSourceName, crawlingState, type CrawlSource } from "@/lib/admin-crawl";

const SOURCES = ["london_theatre", "playbill"] as const;
const number = new Intl.NumberFormat("en-GB");
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
    <dt className="shrink-0 text-subheadline font-semibold sm:w-28">{label}</dt>
    <dd className="min-w-0 text-subheadline">{children}</dd>
  </div>
);
const Log = ({ url }: { url: string | null }) => url
  ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-tint-text">Log</a> : null;

// What runs when: the schedule, what is running now, the last run, what the next one will do, and today's limits.
export function ScheduleCard({ schedule, sources, dispatch }: { schedule: CrawlSchedule; sources: CrawlSource[]; dispatch: CrawlDispatch | null }) {
  const now = new Date(schedule.server_time);
  const alert = scheduleAlert(schedule);
  const limits = todaysLimits(schedule, [...SOURCES, "official"]);
  const last = schedule.last_run;
  const capNotes = SOURCES.flatMap(key => {
    const limit = limits.sources[key];
    return limit.resumes ? [`${crawlSourceName(key)} hit today’s ${number.format(limit.cap)}-page limit; resumes about ${clock(limit.resumes)}.`] : [];
  });
  if (limits.model.resumes) capNotes.push(`The model hit today’s $${limits.model.cap} limit; model work resumes about ${clock(limits.model.resumes)}. Page crawling continues.`);

  return (
    <Section id="schedule" title="What runs when">
      {alert && <p role="alert" className="text-subheadline font-semibold text-destructive">{alert}</p>}
      <dl className="flex flex-col gap-3">
        <Row label="Schedule">
          Runs every 30 minutes, at :{CRON_MINUTES[0]} and :{CRON_MINUTES[1]}. Supabase sends the start on time; GitHub’s own schedule is the backup and is often late.
        </Row>
        <Row label="Trigger">
          {dispatch ? <>
            {dispatchText(dispatch)}
            {dispatch.token === "missing" && (
              <span className="mt-1 block text-footnote text-label-secondary">
                To set it up: create a fine-grained GitHub token for felixng/stubbed only with Actions: Read and write (1 year), then run <code>select vault.create_secret(&apos;&lt;token&gt;&apos;, &apos;github_crawl_dispatch_token&apos;);</code> in the Supabase SQL editor.
              </span>
            )}
          </> : "Couldn’t read the trigger state."}
        </Row>
        <Row label="Now">
          {schedule.running
            ? <>Running since {clock(schedule.running.started_at)} ({viaLabel(schedule.running.started_via)?.toLowerCase() ?? `started by ${triggerLabel(schedule.running.trigger).toLowerCase()}`}). <Log url={schedule.running.log_url} /></>
            : "Idle. Nothing is running, by schedule or by hand."}
        </Row>
        <Row label="Last run">
          {last
            ? <>{clock(last.started_at)} · {durationText(last.started_at, last.finished_at)} · {pagesText(last.per_source)} · {stopReasonText(last.stop_reason, !last.finished_at)}.{viaLabel(last.started_via) ? ` ${viaLabel(last.started_via)}.` : ""} <Log url={last.log_url} /></>
            : "No run recorded yet."}
        </Row>
        <Row label="Next run">
          <p>About {clock(nextRunAfter(now))}.</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {SOURCES.map(key => {
              const forecast = schedule.forecast[key];
              const source = sources.find(item => item.source_key === key);
              const left = Math.max(0, limits.sources[key].cap - limits.sources[key].used);
              if (!forecast || !source) return null;
              if (!forecast.claimable) return <li key={key}>{crawlSourceName(key)}: {crawlingState(source).label.toLowerCase()}, so it will not run.</li>;
              const plan = nextRunPlan(forecast, runAllowance(schedule.limits, key), left);
              return (
                <li key={key}>
                  {crawlSourceName(key)}: {number.format(plan.due)} due → about {number.format(plan.thisRun)} this run
                  <span className="text-label-secondary"> ({number.format(forecast.new)} new, {number.format(forecast.retry)} retrying, {number.format(forecast.reread)} to re-read)</span>
                </li>
              );
            })}
          </ul>
        </Row>
        <Row label="Today’s limits">
          <ul className="flex flex-col gap-0.5">
            <li>Model spend ${limits.model.used.toFixed(2)} of ${limits.model.cap.toFixed(2)} in the last 24 hours.</li>
            {SOURCES.map(key => <li key={key}>{crawlSourceName(key)}: {number.format(limits.sources[key].used)} of {number.format(limits.sources[key].cap)} pages in the last 24 hours.</li>)}
          </ul>
          {capNotes.map(note => <p key={note} className="mt-1 font-semibold">{note}</p>)}
        </Row>
      </dl>
    </Section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { CrawlShell, Section } from "@/components/app/admin/CrawlShell";
import { CRAWL_BUCKETS, CRAWL_BUCKET_LABELS, CRAWL_HUB_PATH, CRAWL_STEPS } from "@/lib/admin-crawl";
import {
  CRON_MINUTES, DEFAULT_DAILY_SPEND_USD, DEFAULT_RUN_SPEND_USD, DEFAULT_SOURCE_DAILY_PAGES, FAST_EXIT_MINUTES, JOB_TIMEOUT_MINUTES,
  MAX_RUN_PAGES, OFFICIAL_RUN_PAGES, REREAD_DAYS, RETRY_DELAYS_SECONDS, RUN_MINUTES, SOURCE_RUN_PAGES,
} from "@/lib/crawl-schedule";

export const metadata: Metadata = { title: "How the crawler works" };

const todayNames: Record<string, string> = {
  directory: "Directory", venue: "Venues", event: "Event details", check: "(hidden)", publish: "Publication, run evidence", suggest: "Logging suggestions",
};
const bucketMeaning: Record<(typeof CRAWL_BUCKETS)[number], string> = {
  done: "Read successfully.", todo: "Queued, or being read right now.", retrying: "Failed once and will try again on its own.", stuck: "Failed or blocked. Needs a look.",
};
const th = "py-2 pr-3 text-footnote font-semibold text-label-secondary";
const waitText = (seconds: number) => (seconds < 3600 ? `${seconds / 60} min` : `${seconds / 3600} ${seconds === 3600 ? "hour" : "hours"}`);
const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
const rereads: [string, number][] = [
  ["Directory page", REREAD_DAYS.directory],
  ["Venue page that lists current or upcoming shows", REREAD_DAYS.venueListingCurrentShows],
  ["Any other venue page", REREAD_DAYS.venueOther],
  ["Show page starting within 30 days, or running now", REREAD_DAYS.eventStartingSoonOrRunning],
  ["Show page further out, or with no date", REREAD_DAYS.eventFurtherOutOrUndated],
  ["Show page in between", REREAD_DAYS.eventOtherwise],
  ["Show page that has closed", REREAD_DAYS.eventClosed],
];

export default function CrawlGuidePage() {
  return (
    <CrawlShell back={{ href: CRAWL_HUB_PATH, label: "Catalogue crawler" }} title="How the crawler works" guide={false}
      intro="The crawler fills the catalogue with trusted venues, shows and run dates so members type less. Logging a show never waits on it.">
      <Section id="steps" title="The six steps" hint="Each step reads the one before it. A step can stop without harming the earlier ones.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-subheadline">
            <thead><tr><th className={th}>Step</th><th className={th}>What it means</th><th className={th}>Older name</th></tr></thead>
            <tbody className="divide-y divide-separator align-top">
              {CRAWL_STEPS.map((step, index) => (
                <tr key={step.key}>
                  <td className="py-2 pr-3 font-semibold">{index + 1}. {step.name}</td>
                  <td className="py-2 pr-3">{step.what}</td>
                  <td className="py-2 text-label-secondary">{todayNames[step.key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-subheadline">Steps 1 to 3 are the crawl. Everything up to and including Check is private; members see nothing until Publish. Suggest is what members see.</p>
      </Section>

      <Section id="how-it-runs" title="How it runs" hint="These numbers come from the values the crawler itself uses.">
        <p className="text-subheadline">
          A run starts every 30 minutes, at :{CRON_MINUTES[0]} and :{CRON_MINUTES[1]}. Supabase sends the start on time. GitHub’s own schedule is only a backup, because GitHub often starts scheduled runs late or not at all.
          If both start a run, they never overlap: the second waits, and if the first left nothing due it exits at once (within {FAST_EXIT_MINUTES} minutes of the last run).
          Starting a run by hand uses the same queue.
        </p>
        <p className="text-subheadline">
          Sources are read at the same time, each with its own allowance, because they are different sites and each site is still paced on its own.
          A source reads up to {SOURCE_RUN_PAGES} pages a run ({OFFICIAL_RUN_PAGES} for the official sites), and the whole run stops after {RUN_MINUTES} minutes (the job is cut off at {JOB_TIMEOUT_MINUTES}).
          Stopping on time is a checkpoint: the source carries on in the next run.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-left text-subheadline">
            <thead><tr><th className={th}>Limit</th><th className={th}>Default</th><th className={th}>Change it with</th></tr></thead>
            <tbody className="divide-y divide-separator align-top">
              <tr><td className="py-2 pr-3">Pages per source per run</td><td className="py-2 pr-3">{SOURCE_RUN_PAGES} (official sites {OFFICIAL_RUN_PAGES}), at most {MAX_RUN_PAGES}</td><td className="py-2"><code>CRAWL_SOURCE_RUN_PAGES</code>, <code>CRAWL_OFFICIAL_RUN_PAGES</code>, or one source with <code>CRAWL_SOURCE_RUN_PAGES_PLAYBILL</code></td></tr>
              <tr><td className="py-2 pr-3">Pages per source per day</td><td className="py-2 pr-3">{DEFAULT_SOURCE_DAILY_PAGES.toLocaleString("en-GB")}, over a rolling 24 hours</td><td className="py-2"><code>CRAWL_SOURCE_DAILY_PAGES</code></td></tr>
              <tr><td className="py-2 pr-3">Model spend per day</td><td className="py-2 pr-3">${DEFAULT_DAILY_SPEND_USD}</td><td className="py-2"><code>CRAWL_DAILY_SPEND_USD</code></td></tr>
              <tr><td className="py-2 pr-3">Model spend per run</td><td className="py-2 pr-3">${DEFAULT_RUN_SPEND_USD}</td><td className="py-2"><code>CRAWL_MAX_SPEND_USD</code></td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-subheadline">
          A source that reaches its daily page limit gets no pages until earlier runs age out of the last 24 hours, and its share goes to the other sources.
          When the daily model limit is reached the crawler skips model work and keeps reading pages.
        </p>

        <h3 className="text-subheadline font-semibold">When a page fails</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] border-collapse text-left text-subheadline">
            <thead><tr><th className={th}>Retry</th><th className={th}>Waits</th><th className={th}>Then</th></tr></thead>
            <tbody className="divide-y divide-separator">
              {RETRY_DELAYS_SECONDS.map((seconds, index) => (
                <tr key={seconds}><td className="py-2 pr-3">{index + 1} of {RETRY_DELAYS_SECONDS.length}</td><td className="py-2 pr-3">{waitText(seconds)}</td><td className="py-2 text-label-secondary">Tries again automatically, in the next run after that</td></tr>
              ))}
              <tr><td className="py-2 pr-3 font-semibold">After the last</td><td className="py-2 pr-3">—</td><td className="py-2 font-semibold">Failed. Won’t retry by itself; an admin retries it.</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-subheadline">
          If a site says we are going too fast, the page waits for the time the site asks, or an hour, and tries again by itself.
          If a site blocks us, the whole source pauses until an admin retries the blocked pages. Retries only happen while a run is active.
        </p>

        <h3 className="text-subheadline font-semibold">When a page is read again</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] border-collapse text-left text-subheadline">
            <thead><tr><th className={th}>Page</th><th className={th}>Read again after</th></tr></thead>
            <tbody className="divide-y divide-separator">
              {rereads.map(([label, count]) => <tr key={label}><td className="py-2 pr-3">{label}</td><td className="py-2">{days(count)}</td></tr>)}
            </tbody>
          </table>
        </div>
        <p className="text-subheadline">Shows that closed more than two years ago are read last.</p>

        <h3 className="text-subheadline font-semibold">To pause</h3>
        <p className="text-subheadline">
          Pause one source with its Crawling switch. To stop everything, set the repository variable <code>CRAWL_LOOP_ENABLED</code> to false; the hub then warns that no run has happened in two hours.
        </p>
      </Section>

      <Section id="statuses" title="Page statuses" hint="Six statuses are grouped into four for summaries. Each page row still shows its exact status under Details.">
        <ul className="flex flex-col gap-1 text-subheadline">
          {CRAWL_BUCKETS.map(bucket => <li key={bucket}><span className="font-semibold">{CRAWL_BUCKET_LABELS[bucket]}.</span> {bucketMeaning[bucket]}</li>)}
        </ul>
      </Section>

      <Section id="switches" title="Switches and fixes" hint="Switches stay as you leave them. Fixes run once and appear only when there is something to fix.">
        <ul className="flex flex-col gap-2 text-subheadline">
          <li><span className="font-semibold">Crawling</span> (switch, per source). Pause if the site complains or you want to stop spending requests. Pages in progress finish.</li>
          <li><span className="font-semibold">Publication</span> (switch, per source). Puts checked venues, shows and run dates into the catalogue on the next crawl run. Turning it off keeps what is already published.</li>
          <li><span className="font-semibold">Run chips</span> (switch, everyone). Members see “On at this venue” suggestions from published run dates, on web and iOS.</li>
          <li><span className="font-semibold">Autofill</span> (locked). Stays off until it scores 99% on 100 labelled cases.</li>
          <li><span className="font-semibold">Retry pages</span> (fix). Hurries failed pages; retrying pages already try again on their own.</li>
          <li><span className="font-semibold">Retry blocked pages</span> (fix). For when you think the block has lifted. Retrying too soon can get us blocked again.</li>
          <li><span className="font-semibold">Read again</span> (fix, per page). Fetches one page afresh, to check it after a parser fix.</li>
          <li><span className="font-semibold">Start a fresh pass</span> (fix, under Advanced). Walks the source from its directory again. The directory already refreshes itself about every 30 days.</li>
        </ul>
      </Section>

      <Section id="complete" title="What “complete” means">
        <p className="text-subheadline">
          A finished pass means every reachable page found so far has been read, as of a time. It never means everything the site has ever shown.
          Totals are pages found so far and can grow while a source is still finding venues.
        </p>
        <p className="text-subheadline">
          A closing date from a booking page is a scheduled end, not a confirmed close. Only a confirmed close lets a run date be trusted for autofill.
        </p>
        <Link href={CRAWL_HUB_PATH} className="inline-flex min-h-11 items-center text-subheadline text-tint-text">Back to the crawler</Link>
      </Section>
    </CrawlShell>
  );
}

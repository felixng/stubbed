import type { Metadata } from "next";
import Link from "next/link";

import { CrawlShell, Section } from "@/components/app/admin/CrawlShell";
import { CRAWL_BUCKETS, CRAWL_BUCKET_LABELS, CRAWL_HUB_PATH, CRAWL_STEPS } from "@/lib/admin-crawl";

export const metadata: Metadata = { title: "How the crawler works" };

const todayNames: Record<string, string> = {
  directory: "Directory", venue: "Venues", event: "Event details", check: "(hidden)", publish: "Publication, run evidence", suggest: "Logging suggestions",
};
const bucketMeaning: Record<(typeof CRAWL_BUCKETS)[number], string> = {
  done: "Read successfully.", todo: "Queued, or being read right now.", retrying: "Failed once and will try again on its own.", stuck: "Failed or blocked. Needs a look.",
};
const th = "py-2 pr-3 text-footnote font-semibold text-label-secondary";

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

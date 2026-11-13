import Link from "next/link";
import { RetryPublication } from "@/components/app/admin/RetryPublication";
import { Section } from "@/components/app/admin/CrawlShell";
import { recentActionText, shortDateTime, type AttentionItem, type CrawlOverview } from "@/lib/admin-crawl";

// "Nothing needs you." is a real answer, so the empty state says it.
export function NeedsAttention({ items, children, hideWhenEmpty = false }: { items: AttentionItem[]; children?: React.ReactNode; hideWhenEmpty?: boolean }) {
  // On the hub, "nothing needs you" is said by the page being short, not by a card.
  if (hideWhenEmpty && items.length === 0 && !children) return null;
  return (
    <Section id="needs-attention" title="Needs attention">
      {items.length === 0 ? <p className="text-subheadline text-label-secondary">Nothing needs you.</p> : (
        <ul className="flex flex-col divide-y divide-separator">
          {items.map((item, index) => (
            <li key={index} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
              <div className="min-w-0">
                <p className="text-subheadline"><span className="font-semibold">{item.source}:</span> {item.text}</p>
                {item.reason && <p className="break-words text-footnote text-label-secondary">{item.reason}</p>}
                {item.next && <p className="text-footnote text-label-secondary">{item.next}</p>}
              </div>
              {item.retryPublication
                ? <RetryPublication source={item.retryPublication} />
                : <Link href={item.href} className="inline-flex min-h-11 items-center text-subheadline text-tint-text">View</Link>}
            </li>
          ))}
        </ul>
      )}
      {children}
    </Section>
  );
}

export function RecentChanges({ actions }: { actions: CrawlOverview["recent_actions"] }) {
  return (
    <Section id="recent-changes" title="Recent changes" hint="Who changed what, newest first. Answers “why is this paused?”">
      {actions.length === 0 ? <p className="text-subheadline text-label-secondary">No changes made from Backstage yet.</p> : (
        <ul className="flex flex-col divide-y divide-separator">
          {actions.map((action, index) => (
            <li key={index} className="flex flex-wrap justify-between gap-x-4 py-2 text-subheadline">
              <span className="min-w-0">{recentActionText(action)}</span>
              <time dateTime={action.at} className="text-label-secondary">{shortDateTime(action.at)}</time>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

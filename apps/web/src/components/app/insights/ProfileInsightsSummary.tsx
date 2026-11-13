"use client";

import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { PlaceholderRows } from "@/components/ui/PlaceholderRows";
import { count } from "@/lib/plural";
import { isPro } from "@/lib/membership";
import { withPreview } from "@/lib/paywall";
import { useMembership } from "@/lib/use-membership";
import { useOwnInsights } from "@/lib/use-own-insights";
import { ActivityGrid } from "./ActivityGrid";
import { UpgradeBanner } from "./UpgradeBanner";

// The owner's current-year summary on Profile (#226): visits, weekly streak, best streak this
// year, the activity grid and a link to Insights. Always the current year, whatever period Insights
// has open. Owner only; the public profile never uses it.
export function ProfileInsightsSummary({ thisYear, preview = false }: { thisYear: number; preview?: boolean }) {
  const { stats, failed, retry } = useOwnInsights(thisYear, preview);
  const { membership, config, leave } = useMembership(preview);
  return (
    <>
    <section aria-label={`${thisYear} in theatre`} className="flex flex-col gap-3 rounded-md border border-separator bg-surface p-4 shadow-sm">
      <h2 className="text-headline text-label">{thisYear}</h2>
      {failed ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-subheadline text-label-secondary">Your stats couldn’t load.</p>
          <Button size="sm" variant="secondary" onClick={retry}>Try again</Button>
        </div>
      ) : !stats ? <PlaceholderRows rows={1} /> : (
        <>
          <dl className="grid grid-cols-3 gap-3">
            <div><dd className="text-title-2 font-display text-label">{stats.total}</dd><dt className="text-footnote text-label-secondary">{stats.total === 1 ? "visit" : "visits"}</dt></div>
            <div><dd className="text-title-2 font-display text-label">{stats.streaks.current_weekly}</dd><dt className="text-footnote text-label-secondary">weekly streak</dt></div>
            <div><dd className="text-title-2 font-display text-label">{stats.streaks.longest_weekly}</dd><dt className="text-footnote text-label-secondary">best this year</dt></div>
          </dl>
          <p className="sr-only">{count(stats.total, "visit")} this year, a current streak of {count(stats.streaks.current_weekly, "week")}.</p>
          <ActivityGrid year={thisYear} days={stats.days} />
        </>
      )}
      <Link href="/app/stats" className="-mb-2 inline-flex min-h-11 items-center self-start text-subheadline font-semibold text-tint-text focus-visible:outline-2 focus-visible:outline-focus">
        Insights
      </Link>
    </section>
    {/* Free with sales on: the upgrade banner. Members manage Pro in Settings › Membership. */}
    {membership && !isPro(membership) && config.salesEnabled ? (
      <UpgradeBanner source="profile" next={withPreview("/app/profile", preview)} name={config.name} preview={preview} onLeave={leave} />
    ) : null}
    </>
  );
}

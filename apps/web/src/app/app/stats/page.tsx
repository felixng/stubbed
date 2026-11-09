import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { InsightsScreen } from "@/components/app/insights/InsightsScreen";
import { PlaceholderRows } from "@/components/ui/PlaceholderRows";
import { parsePeriod } from "@/lib/insights";
import { previewFree } from "@/lib/paywall";

export const metadata: Metadata = { title: "Insights" };

// The owner's Insights (#226). ?year=2025 or ?year=all picks the period; the default is this year.
export default function StatsPage({ searchParams }: PageProps<"/app/stats">) {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/app/profile" className="text-subheadline text-tint-text">Profile</Link>
      <h1 className="text-large-title font-bold tracking-tight">Insights</h1>
      <Suspense fallback={<PlaceholderRows rows={3} />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/app/stats">, "searchParams">) {
  // Per request: the current year needs the clock, which can't prerender.
  await connection();
  const params = await searchParams;
  const raw = params.year;
  // The server year is only the starting point; own_insights decides what "this year" is.
  const thisYear = new Date().getUTCFullYear();
  return <InsightsScreen initialYear={parsePeriod(Array.isArray(raw) ? raw[0] : raw, thisYear)} thisYear={thisYear} preview={previewFree(params.paywallPreview)} />;
}

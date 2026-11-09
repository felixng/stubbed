import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { InsightsShare } from "@/components/app/share/InsightsShare";
import { PlaceholderRows } from "@/components/ui/PlaceholderRows";
import { previewFree } from "@/lib/paywall";
import { getOwnProfile } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Share theatre stats" };
export default function Page({ searchParams }: PageProps<"/app/insights/share">) {
  return <div className="flex flex-col gap-5">
    <Link href="/app/profile" className="text-subheadline text-tint-text">Profile</Link>
    <h1 className="text-large-title font-bold tracking-tight">Share theatre stats</h1>
    <Suspense fallback={<PlaceholderRows rows={3} />}><Content searchParams={searchParams} /></Suspense>
  </div>;
}
async function Content({ searchParams }: Pick<PageProps<"/app/insights/share">, "searchParams">) {
  const profile = await getOwnProfile();
  const { paywallPreview } = await searchParams;
  return profile?.handle ? <InsightsShare handle={profile.handle} preview={previewFree(paywallPreview)} /> : null;
}

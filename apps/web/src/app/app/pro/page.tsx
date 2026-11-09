import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { Paywall } from "@/components/app/pro/Paywall";
import { PlaceholderRows } from "@/components/ui/PlaceholderRows";
import { parseSource, previewFree, safePaywallNext } from "@/lib/paywall";
import { currentUser } from "@/lib/supabase/require-user";
import { checkoutPreview } from "@/lib/web-checkout";

export const metadata: Metadata = { title: "Upgrade" };

// The one paywall (#261): /app/pro?from=<where it was opened>&next=<where to go after>. `next` is
// accepted only as a path inside /app/, otherwise Insights. Reached from the banners, never forced
// on opening a screen.
export default function ProPage({ searchParams }: PageProps<"/app/pro">) {
  return (
    <Suspense fallback={<PlaceholderRows rows={3} />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/app/pro">, "searchParams">) {
  await connection();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const preview = previewFree(params.paywallPreview);
  // The signed-in user's id comes from the server-rendered session, never the URL or a form.
  const user = await currentUser();
  return (
    <Paywall
      source={parseSource(one(params.from))}
      next={safePaywallNext(one(params.next))}
      preview={preview}
      userId={user?.id ?? ""}
      checkout={checkoutPreview(params.checkoutPreview)}
    />
  );
}

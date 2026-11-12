import { redirect } from "next/navigation";
import { Suspense } from "react";
import { OFFICIAL_SITES_PATH } from "@/lib/admin-crawl";

// Old bookmarks: /crawl/sites moved under the Official source.
async function Redirect({ searchParams }: Pick<PageProps<"/app/backstage/crawl/sites">, "searchParams">) {
  redirect((await searchParams).attention === "1" ? `${OFFICIAL_SITES_PATH}?attention=1` : OFFICIAL_SITES_PATH);
  return null;
}

export default function LegacySitesPage(props: Pick<PageProps<"/app/backstage/crawl/sites">, "searchParams">) {
  return <Suspense fallback={null}><Redirect searchParams={props.searchParams} /></Suspense>;
}

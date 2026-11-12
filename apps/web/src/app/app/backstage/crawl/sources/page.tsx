import { redirect } from "next/navigation";
import { Suspense } from "react";
import { legacySourcesRedirect } from "@/lib/admin-crawl";

// Old bookmarks: /crawl/sources?source=X&stage=Y&status=Z&page=N land on the source or its pages list.
async function Redirect({ searchParams }: Pick<PageProps<"/app/backstage/crawl/sources">, "searchParams">) {
  redirect(legacySourcesRedirect(await searchParams));
  return null;
}

export default function LegacySourcesPage(props: Pick<PageProps<"/app/backstage/crawl/sources">, "searchParams">) {
  return <Suspense fallback={null}><Redirect searchParams={props.searchParams} /></Suspense>;
}

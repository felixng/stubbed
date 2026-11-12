import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { UUID, runPath } from "@/lib/admin-crawl";

// Old bookmarks: /crawl/<run id> moved to /crawl/runs/<run id>.
async function Redirect({ params }: Pick<PageProps<"/app/backstage/crawl/[id]">, "params">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  redirect(runPath(id));
  return null;
}

export default function LegacyRunPage(props: Pick<PageProps<"/app/backstage/crawl/[id]">, "params">) {
  return <Suspense fallback={null}><Redirect params={props.params} /></Suspense>;
}

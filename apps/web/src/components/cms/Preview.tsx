import { draftMode } from "next/headers";
import { VisualEditor } from "./VisualEditor";
import { cmsClient } from "@/lib/cms/client";
import { cmsLive } from "@/lib/cms/live";

export async function Preview() {
  if (!cmsClient) return null;
  const preview = (await draftMode()).isEnabled;
  const SanityLive = cmsLive?.SanityLive;
  return <>
    {SanityLive && <SanityLive includeDrafts={false} />}
    {preview && <>
      <form action="/api/draft-mode/disable" method="post" className="fixed right-4 bottom-4 z-50 rounded-lg bg-label p-3 text-background">
        <button type="submit" className="cursor-pointer">Exit content preview</button>
      </form>
      <VisualEditor />
    </>}
  </>;
}

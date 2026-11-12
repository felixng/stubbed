import { draftMode } from "next/headers";
import { ExitPreview } from "./ExitPreview";
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
      <ExitPreview />
      <VisualEditor />
    </>}
  </>;
}

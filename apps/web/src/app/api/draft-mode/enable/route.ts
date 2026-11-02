import { defineEnableDraftMode } from "next-sanity/draft-mode";
import { cmsClient } from "@/lib/cms/client";

export async function GET(request: Request) {
  if (!cmsClient || !process.env.SANITY_API_READ_TOKEN) {
    return new Response("Content preview is not configured", { status: 503 });
  }
  // Sanity verifies a short-lived preview secret before enabling draft cookies.
  return defineEnableDraftMode({
    client: cmsClient.withConfig({ token: process.env.SANITY_API_READ_TOKEN, useCdn: false }),
  }).GET(request);
}

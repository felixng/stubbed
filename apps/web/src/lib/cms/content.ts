import "server-only";

import { cache } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { cookies, draftMode } from "next/headers";
import { resolvePerspectiveFromCookies } from "next-sanity/live";
import { stegaClean } from "next-sanity";

import { copyDefinitions } from "./definitions";
import { cmsClient } from "./client";
import { mergeCopy, defaultsFor, safeEmail, safeWebUrl, type CopySection, type ContentDocument } from "./model";

async function readPublishedDocument(id: ContentDocument): Promise<Record<string, unknown> | null> {
  "use cache";
  cacheLife({ stale: 0, revalidate: 60, expire: 3600 });
  cacheTag("cms-copy");
  try {
    if (!cmsClient) return null;
    // Cache only this function's result. After a publishing webhook expires it,
    // read the authoritative API rather than another fetch cache or the CDN.
    return await cmsClient.fetch<Record<string, unknown> | null>(
      '*[_id == $id && _type == $id][0]', { id }, {
        perspective: "published",
        useCdn: false,
        stega: false,
        cache: "no-store",
      },
    );
  } catch (error) {
    console.error("Sanity published content unavailable; using repository copy", error instanceof Error ? error.message : "Unknown error");
    return null;
  }
}

export const getCopy = cache(async function getCopy<S extends CopySection>(section: S) {
  if (!cmsClient) return defaultsFor(section);
  const id = copyDefinitions[section].document;
  const preview = (await draftMode()).isEnabled && Boolean(process.env.SANITY_API_READ_TOKEN);
  const perspective = preview ? await resolvePerspectiveFromCookies({ cookies: await cookies() }) ?? "drafts" : "published";
  if (perspective === "published") {
    const document = await readPublishedDocument(id);
    return mergeCopy(section, document?.[section]);
  }
  // Drafts bypass every persistent cache and never reach public visitors.
  try {
    const document = await cmsClient.fetch<Record<string, unknown> | null>(
      '*[_id == $id && _type == $id][0]', { id }, {
        perspective,
        token: process.env.SANITY_API_READ_TOKEN,
        useCdn: false,
        stega: true,
        cache: "no-store",
      },
    );
    return mergeCopy(section, document?.[section]);
  } catch (error) {
    console.error("Sanity draft content unavailable", error instanceof Error ? error.message : "Unknown error");
    return defaultsFor(section);
  }
});

export async function getSiteCopy() {
  const copy = await getCopy("site");
  const defaults = defaultsFor("site");
  return {
    ...copy,
    pressEmail: safeEmail(stegaClean(copy.pressEmail), defaults.pressEmail),
    instagramUrl: safeWebUrl(stegaClean(copy.instagramUrl), defaults.instagramUrl),
  };
}

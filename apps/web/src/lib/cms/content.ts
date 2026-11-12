import "server-only";

import { cache } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { cookies, draftMode } from "next/headers";
import { resolvePerspectiveFromCookies } from "next-sanity/live";
import { stegaClean } from "next-sanity";

import { copyDefinitions } from "./definitions";
import { cmsClient } from "./client";
import { mergeCopy, defaultsFor, safeEmail, safeWebUrl, type CopySection, type ContentDocument } from "./model";
import { aboutDefaultSections, cleanSections, type PageSection } from "./sections";
import { LEGAL } from "../legal";

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

// The document a page reads from: published for visitors, drafts only inside an
// authenticated preview, never cached for drafts.
const getDocument = cache(async function getDocument(id: ContentDocument): Promise<{ document: Record<string, unknown> | null; preview: boolean }> {
  if (!cmsClient) return { document: null, preview: false };
  const preview = (await draftMode()).isEnabled && Boolean(process.env.SANITY_API_READ_TOKEN);
  const perspective = preview ? await resolvePerspectiveFromCookies({ cookies: await cookies() }) ?? "drafts" : "published";
  if (perspective === "published") return { document: await readPublishedDocument(id), preview: false };
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
    return { document, preview: true };
  } catch (error) {
    console.error("Sanity draft content unavailable", error instanceof Error ? error.message : "Unknown error");
    return { document: null, preview: true };
  }
});

export const getCopy = cache(async function getCopy<S extends CopySection>(section: S) {
  const { document } = await getDocument(copyDefinitions[section].document);
  return mergeCopy(section, document?.[section]);
});

// Sections of /about. Falls back to repository copy (including edits made to the
// older fixed fields) until the page has been edited as sections.
export async function getAboutSections(): Promise<PageSection[]> {
  const { document } = await getDocument("aboutPage");
  const sections = cleanSections(document?.sections, stegaClean);
  if (sections) return sections;
  return aboutDefaultSections(mergeCopy("about", document?.about), LEGAL.email);
}

export async function getSiteCopy() {
  const copy = await getCopy("site");
  const defaults = defaultsFor("site");
  return {
    ...copy,
    pressEmail: safeEmail(stegaClean(copy.pressEmail), defaults.pressEmail),
    instagramUrl: safeWebUrl(stegaClean(copy.instagramUrl), defaults.instagramUrl),
  };
}

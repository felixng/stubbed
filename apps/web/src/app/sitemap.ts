import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// Public information pages only. User content isn't enumerated here.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL.href, changeFrequency: "weekly", priority: 1 },
    { url: new URL("/about", SITE_URL).href, changeFrequency: "monthly", priority: 0.5 },
    { url: new URL("/faq", SITE_URL).href, changeFrequency: "monthly", priority: 0.5 },
    { url: new URL("/terms", SITE_URL).href, changeFrequency: "yearly", priority: 0.2 },
    { url: new URL("/privacy", SITE_URL).href, changeFrequency: "yearly", priority: 0.2 },
  ];
}

import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// /login isn't disallowed: it's linked from the landing menu, and crawlers
// must be able to fetch it to see its noindex tag. A disallowed page can
// still be indexed (URL only) from links pointing at it. Link-preview images
// (/api/og/) are allowed: some unfurlers (X's, for one) honour robots.txt.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/api/og/"],
      disallow: ["/app", "/auth", "/api", "/dressingroom"],
    },
    sitemap: new URL("/sitemap.xml", SITE_URL).href,
  };
}

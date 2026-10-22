import { designSystemMarkdown } from "@/lib/design-system";
import { SITE_URL } from "@/lib/site";

// /design-system.md: the design system as plain markdown, to paste or link
// into other AI tools. Same data as the /design-system page. Static,
// generated at build time.
export function GET() {
  return new Response(designSystemMarkdown(new URL("/design-system", SITE_URL).href), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Robots-Tag": "noindex",
    },
  });
}

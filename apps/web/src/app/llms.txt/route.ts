import { getSiteCopy } from "@/lib/cms/content";
import { getFaqSections, faqAnswerText } from "@/lib/faq";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// /llms.txt: a plain-text summary for AI assistants (llmstxt.org). Built
// from the same CMS content used by the public pages.
export async function GET() {
  const site = await getSiteCopy();
  const FAQS = (await getFaqSections()).flatMap((section) => section.items);
  const body = [
    `# ${SITE_NAME}`,
    "",
    `> ${site.description}`,
    "",
    site.llmsIntroduction,
    "",
    site.llmsStatus,
    "",
    "## Questions",
    "",
    ...FAQS.map((faq) => `- **${faq.question}** ${faqAnswerText(faq)}${faq.link ? ` (${new URL(faq.link.href, SITE_URL).href})` : ""}`),
    "",
    "## Links",
    "",
    `- [Home page](${SITE_URL.href})`,
    `- [Sign up](${new URL("/signup", SITE_URL).href})`,
    `- [About](${new URL("/about", SITE_URL).href})`,
    `- [FAQ and guides](${new URL("/faq", SITE_URL).href})`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

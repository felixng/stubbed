import { getCopy } from "@/lib/cms/content";
import type { Metadata, Viewport } from "next";

import { ContentPage } from "@/components/landing/ContentPage";
import { Faq } from "@/components/landing/Faq";
import { getFaqSections, faqAnswerText } from "@/lib/faq";
import { SITE_NAME } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const copy = await getCopy("faqMeta");
  return { title: copy.seoTitle, description: copy.description,
    alternates: { canonical: "/faq" },
    openGraph: { title: copy.seoTitle, description: copy.description, url: "/faq" },
  };
}

export const viewport: Viewport = { themeColor: "#f2f2f7" };

// FAQPage structured data, built from the same list the page shows.


export default async function FaqPage() {
  const pageCopy = await getCopy("faqMeta");
  const FAQS = (await getFaqSections()).flatMap((section) => section.items);
  const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  name: `${SITE_NAME} FAQ and guides`,
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faqAnswerText(faq) },
  })),
};
  return (
    <ContentPage title={pageCopy.title}>
      <script
        type="application/ld+json"
        // Static object, but escape "<" anyway so it can never close the tag.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c"),
        }}
      />
      <Faq />
    </ContentPage>
  );
}

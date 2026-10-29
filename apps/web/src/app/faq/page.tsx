import type { Metadata, Viewport } from "next";

import { ContentPage } from "@/components/landing/ContentPage";
import { Faq, FAQS } from "@/components/landing/Faq";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Questions — Stubbed",
  description: "Answers to common questions about Stubbed, the theatre diary.",
  alternates: { canonical: "/faq" },
};

export const viewport: Viewport = { themeColor: "#f2f2f7" };

// FAQPage structured data, built from the same list the page shows.
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  name: `${SITE_NAME} questions`,
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
};

export default function FaqPage() {
  return (
    <ContentPage title="Questions">
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

import type { Metadata, Viewport } from "next";

import { ContentPage } from "@/components/landing/ContentPage";
import { Faq } from "@/components/landing/Faq";
import { FAQS, faqAnswerText } from "@/lib/faq";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "FAQ and guides — Stubbed",
  description: "Get started with Stubbed: install on Android, log shows, import theatre photos, and manage your privacy and data.",
  alternates: { canonical: "/faq" },
};

export const viewport: Viewport = { themeColor: "#f2f2f7" };

// FAQPage structured data, built from the same list the page shows.
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

export default function FaqPage() {
  return (
    <ContentPage title="FAQ and guides">
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

import type { Metadata, Viewport } from "next";

import { Callouts } from "@/components/landing/Callouts";
import { Container } from "@/components/landing/Container";
import { Features } from "@/components/landing/Features";
import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { SiteMenu } from "@/components/landing/SiteMenu";
import { Wordmark } from "@/components/ui/Wordmark";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";

// A page's openGraph replaces the layout's rather than merging, so it's
// spelled out in full here.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en",
  },
};

// Structured data: the site name for search results and what the product is
// (the FAQPage lives on /faq). No offers or prices.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": new URL("/#website", SITE_URL).href,
      name: SITE_NAME,
      url: SITE_URL.href,
      description: SITE_DESCRIPTION,
      publisher: { "@id": new URL("/#organization", SITE_URL).href },
    },
    {
      "@type": "Organization",
      "@id": new URL("/#organization", SITE_URL).href,
      name: SITE_NAME,
      url: SITE_URL.href,
    },
    {
      "@type": "WebApplication",
      name: SITE_NAME,
      url: SITE_URL.href,
      description: SITE_DESCRIPTION,
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Any (web browser)",
      publisher: { "@id": new URL("/#organization", SITE_URL).href },
    },
  ],
};

// The landing page is always light, whatever the visitor's appearance.
export const viewport: Viewport = { themeColor: "#f2f2f7" };

// Public landing page (#230): the hero with sign-up, four features led by
// sharing, minor callouts, a final call to action and a minimal footer. The
// menu links to /login.
export default function Home() {
  return (
    <div data-theme="light" className="flex flex-1 flex-col">
      <script
        type="application/ld+json"
        // Static object, but escape "<" anyway so it can never close the tag.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c"),
        }}
      />
      <header>
        <Container className="flex items-center justify-between gap-4 py-6 sm:py-8">
          <Wordmark size={28} href="/" mark />
          <div className="flex items-center gap-2">
            <p className="inline-flex min-h-7 items-center rounded-pill bg-fill px-3 text-footnote font-medium text-label">
              <span className="sm:hidden">Beta</span>
              <span className="hidden sm:inline">Now in public beta</span>
            </p>
            <SiteMenu />
          </div>
        </Container>
      </header>
      <main className="flex-auto">
        <Hero />
        <Features />
        <Callouts />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

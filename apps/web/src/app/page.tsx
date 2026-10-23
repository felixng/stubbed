import type { Metadata, Viewport } from "next";

import { Container } from "@/components/landing/Container";
import { Features } from "@/components/landing/Features";
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
// (the FAQPage lives on /faq). No offers or prices: sign-ups aren't open yet.
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
export const viewport: Viewport = { themeColor: "#fff9f6" };

// Public landing page: hero + waitlist and features (#9). The menu links to
// /login (owner's call); sign-ups stay off, so that reveals nothing.
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
          <Wordmark size={28} href="/" />
          <div className="flex items-center gap-2">
            <p className="inline-flex min-h-7 items-center rounded-pill bg-fill px-3 text-footnote font-medium text-label">
              <span className="sm:hidden">Private beta</span>
              <span className="hidden sm:inline">Currently in private beta</span>
            </p>
            <SiteMenu />
          </div>
        </Container>
      </header>
      <main className="flex-auto">
        <Hero />
        <Features />
      </main>
      <Footer />
    </div>
  );
}

import { getCopy, getSiteCopy } from "@/lib/cms/content";
import type { Metadata, Viewport } from "next";

import { Container } from "@/components/landing/Container";
import { Features } from "@/components/landing/Features";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { SignUpReminder } from "@/components/landing/SignUpReminder";
import { SiteMenu } from "@/components/landing/SiteMenu";
import { Wordmark } from "@/components/ui/Wordmark";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// A page's openGraph replaces the layout's rather than merging, so it's
// spelled out in full here.
export async function generateMetadata(): Promise<Metadata> {
  const copy = await getSiteCopy();
  return { title: copy.title, description: copy.description, alternates: { canonical: "/" },
    openGraph: { type: "website", url: "/", siteName: SITE_NAME, title: copy.title, description: copy.description, locale: "en" },
  };
}

// Structured data: the site name for search results and what the product is
// (the FAQPage lives on /faq). No offers or prices.


// The landing page is always light, whatever the visitor's appearance.
export const viewport: Viewport = { themeColor: "#f2f2f7" };

// Public landing page: hero with sign-up, and features (#9, #149). The header
// button links to /login, or the app when signed in.
export default async function Home() {
  const [site, featureCopy] = await Promise.all([getSiteCopy(), getCopy("features")]);
  const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": new URL("/#website", SITE_URL).href,
      name: SITE_NAME,
      url: SITE_URL.href,
      description: site.description,
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
      description: site.description,
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Any (web browser)",
      publisher: { "@id": new URL("/#organization", SITE_URL).href },
    },
  ],
};
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
        <Container className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-6 sm:py-8">
          <Wordmark size={28} href="/" mark />
          <div className="ml-auto flex items-center gap-2">
            <p className="hidden min-h-7 items-center rounded-pill bg-fill px-3 text-footnote font-medium text-label lg:inline-flex">
              {site.betaLabel}
            </p>
            <SiteMenu />
          </div>
        </Container>
      </header>
      <main className="flex-auto">
        <Hero />
        <Features copy={featureCopy} />
        <SignUpReminder />
      </main>
      <Footer />
    </div>
  );
}

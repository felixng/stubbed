import { Suspense } from "react";
import { Preview } from "@/components/cms/Preview";
import { getSiteCopy } from "@/lib/cms/content";
import type { Metadata, Viewport } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { SiteAnalytics } from "@/components/SiteAnalytics";
import { PageLoading } from "@/components/ui/PageLoading";
import "./globals.css";

// Type is the system font (SF Pro on Apple devices), set in globals.css, so
// the web matches the iOS app. No web fonts to load.

// Defaults for every page. The canonical link lives on the landing page
// itself, so other routes don't claim to be the home page.
export async function generateMetadata(): Promise<Metadata> {
  const copy = await getSiteCopy();
  return {
  metadataBase: SITE_URL,
  applicationName: SITE_NAME,
  title: copy.title,
  description: copy.description,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: copy.title,
    description: copy.description,
    locale: "en",
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false, email: false, address: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans text-body">
        <Suspense fallback={<PageLoading />}>{children}</Suspense>
        <Suspense fallback={null}><Preview /></Suspense>
        <SiteAnalytics />
      </body>
    </html>
  );
}

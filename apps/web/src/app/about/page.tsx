import { getCopy } from "@/lib/cms/content";
import type { Metadata, Viewport } from "next";

import { About } from "@/components/landing/About";
import { ContentPage } from "@/components/landing/ContentPage";

export async function generateMetadata(): Promise<Metadata> {
  const copy = await getCopy("aboutMeta");
  return { title: copy.seoTitle, description: copy.description,
    alternates: { canonical: "/about" },
    openGraph: { title: copy.seoTitle, description: copy.description, url: "/about" },
  };
}

export const viewport: Viewport = { themeColor: "#f2f2f7" };

export default async function AboutPage() {
  const pageCopy = await getCopy("aboutMeta");
  return (
    <ContentPage title={pageCopy.title}>
      <About />
    </ContentPage>
  );
}

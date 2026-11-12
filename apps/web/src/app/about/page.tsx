import { getAboutSections, getCopy } from "@/lib/cms/content";
import type { Metadata, Viewport } from "next";

import { SectionPage } from "@/components/cms/SectionPage";
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
  const [pageCopy, sections] = await Promise.all([getCopy("aboutMeta"), getAboutSections()]);
  return (
    <ContentPage title={pageCopy.title}>
      <SectionPage sections={sections} />
    </ContentPage>
  );
}

import type { Metadata, Viewport } from "next";

import { About } from "@/components/landing/About";
import { ContentPage } from "@/components/landing/ContentPage";

// Not linked from anywhere or in the sitemap yet (owner's call).
export const metadata: Metadata = {
  title: "About — Stubbed",
  description: "What Stubbed is: a theatre diary for the theatre regulars.",
  alternates: { canonical: "/about" },
};

export const viewport: Viewport = { themeColor: "#f2f2f7" };

export default function AboutPage() {
  return (
    <ContentPage title="What is Stubbed?">
      <About />
    </ContentPage>
  );
}

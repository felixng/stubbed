import type { Metadata, Viewport } from "next";

import { About } from "@/components/landing/About";
import { ContentPage } from "@/components/landing/ContentPage";

export const metadata: Metadata = {
  title: "About — Stubbed",
  description: "A theatre diary built by a theatre regular. Meet Felix and find out why he built Stubbed.",
  alternates: { canonical: "/about" },
};

export const viewport: Viewport = { themeColor: "#f2f2f7" };

export default function AboutPage() {
  return (
    <ContentPage title="About Stubbed">
      <About />
    </ContentPage>
  );
}

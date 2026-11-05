import type { Metadata } from "next";
import { Studio } from "@/components/cms/Studio";
import { projectId } from "@/lib/cms/client";

export const metadata: Metadata = {
  title: "Stubbed content editor",
  robots: { index: false, follow: false },
};

export default function StudioPage() {
  if (!projectId) {
    return <main className="mx-auto max-w-xl p-8">
      <h1 className="text-title">Content editor setup</h1>
      <p className="mt-4">The content editor is not connected yet. Follow the Sanity setup guide in docs/CMS.md.</p>
    </main>;
  }
  return <Studio />;
}

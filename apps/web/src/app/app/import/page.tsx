import type { Metadata } from "next";

import { ImportTool } from "@/components/app/import/ImportTool";
import { BackLink } from "@/components/ui/BackLink";

export const metadata: Metadata = { title: "Import" };

// Bulk import from confirmation emails or photos (#17, #18), as every user
// gets it: the default AI chain, no model picker. Admins compare models at
// /app/admin/import. The steps live in lib/import so a mobile-first flow can
// reuse them.
export default function ImportPage() {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <BackLink href="/app/log">Log</BackLink>
        <h1 className="text-title font-display text-label">Import</h1>
        <p className="text-subheadline text-label-secondary">
          Bring in past shows from ticket emails or theatre photos. You check every one before it’s saved.
        </p>
      </div>
      <ImportTool />
    </section>
  );
}

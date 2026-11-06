import type { Metadata } from "next";
import { BackLink } from "@/components/ui/BackLink";
import { MezzanineImport } from "@/components/app/import/MezzanineImport";
export const metadata: Metadata = { title: "Import from Mezzanine" };
export default function MezzaninePage() {
  return <section className="flex flex-col gap-5">
    <div><BackLink href="/app/import">Import</BackLink><h1 className="text-title font-display text-label">Import from Mezzanine</h1></div>
    <MezzanineImport />
  </section>;
}

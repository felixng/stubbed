import type { Metadata } from "next";
import { Group, SettingsLink } from "@/components/app/SettingsGroup";
import { BackLink } from "@/components/ui/BackLink";
export const metadata: Metadata = { title: "Import shows" };
export default function ImportPage() {
  return <section className="flex flex-col gap-5">
    <div><BackLink href="/app/log">Log</BackLink><h1 className="text-title font-display text-label">Import shows</h1></div>
    <Group title="Bring in your shows">
      <SettingsLink href="/app/import/photos"><span><span className="block font-medium">Import from Photos</span><span className="text-subheadline text-label-secondary">Pick photos from your shows. Stubbed sorts them by show.</span></span></SettingsLink>
      <SettingsLink href="/app/import/mezzanine"><span><span className="block font-medium">Import from Mezzanine</span><span className="text-subheadline text-label-secondary">Bring over your Mezzanine diary from a CSV or JSON file.</span></span></SettingsLink>
    </Group>
  </section>;
}

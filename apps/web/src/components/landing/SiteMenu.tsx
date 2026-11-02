import { getCopy } from "@/lib/cms/content";
import { SiteMenuClient } from "./SiteMenuClient";

export async function SiteMenu() {
  const copy = await getCopy("footer");
  return <SiteMenuClient copy={copy} />;
}

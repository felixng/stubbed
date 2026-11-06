import { getCopy } from "@/lib/cms/content";
import { SiteMenuClient } from "./SiteMenuClient";

export async function SiteMenu() {
  const [copy, landing] = await Promise.all([getCopy("footer"), getCopy("sharingLanding")]);
  return <SiteMenuClient copy={copy} signupLabel={landing.signup} />;
}

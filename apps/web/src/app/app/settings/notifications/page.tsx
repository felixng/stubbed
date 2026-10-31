import { MobilePushSetup } from "@/components/notifications/MobilePushSetup";
import { PushSettings } from "@/components/notifications/PushSettings";
import { CategorySettings } from "@/components/notifications/CategorySettings";
import type { Metadata } from "next";
import { BackLink } from "@/components/ui/BackLink";
export const metadata: Metadata = { title: "Notification settings" };
export default function NotificationSettingsPage() {
  return <section className="flex flex-col gap-5"><div><BackLink href="/app/settings">Settings</BackLink><h1 className="text-title font-display text-label">Notification settings</h1></div><p className="text-body text-label-secondary">Likes, comments and follow activity share one inbox across Stubbed.</p><MobilePushSetup /><PushSettings /><CategorySettings channel="inbox" /></section>;
}

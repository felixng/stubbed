import type { Metadata } from "next";
import { MobilePushSetup } from "@/components/notifications/MobilePushSetup";
import { Inbox } from "@/components/notifications/Inbox";
import { BackLink } from "@/components/ui/BackLink";
export const metadata: Metadata = { title: "Notifications" };
export default function NotificationsPage() {
  return <section className="flex flex-col gap-5">
    <div><BackLink href="/app">Home</BackLink><h1 className="text-title font-display text-label">Notifications</h1></div>
    <MobilePushSetup />
    <Inbox />
  </section>;
}

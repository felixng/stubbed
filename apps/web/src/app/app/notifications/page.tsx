import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/ui/BackLink";
import { EmptyState } from "@/components/app/EmptyState";
export const metadata: Metadata = { title: "Notifications" };
export default function NotificationsPage() {
  return <section className="flex flex-col gap-5">
    <div><BackLink href="/app">Home</BackLink><h1 className="text-title font-display text-label">Notifications</h1></div>
    <Link href="/app/settings/notifications" className="text-tint-text underline underline-offset-2">Notification settings</Link>
    <EmptyState title="You’re all caught up">Likes, comments and follow activity will appear here.</EmptyState>
  </section>;
}

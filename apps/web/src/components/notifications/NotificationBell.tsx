import Link from "next/link";

/** The inbox count is supplied by the shared inbox integration in slice 2. */
export function NotificationBell({ unread = 0 }: { unread?: number }) {
  return <Link href="/app/notifications" title="Notifications" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-label hover:bg-fill focus-visible:outline-2 focus-visible:outline-focus">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
    {unread > 0 && <span aria-hidden="true" className="absolute right-2 top-2 size-2 rounded-full bg-tint-text" />}
  </Link>;
}

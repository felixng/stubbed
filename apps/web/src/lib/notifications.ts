export const notificationCategories = ["like", "comment", "follower", "follow_request", "follow_accepted"] as const;
export type NotificationCategory = typeof notificationCategories[number];
export const categoryLabels: Record<NotificationCategory, string> = {
  like: "Likes on your shows", comment: "Comments on your shows", follower: "New followers",
  follow_request: "Follow requests", follow_accepted: "Accepted follow requests",
};
export type InboxItem = {
  id: string; category: NotificationCategory; updated_at: string; revision: number; unread: boolean;
  actor_id: string; handle: string; display_name: string | null; avatar_url: string | null;
  actor_count: number; show_title: string | null; entry_id: string | null;
};
export function notificationText(n: InboxItem): string {
  const actor = n.display_name || `@${n.handle}`;
  switch (n.category) {
    case "like": return `${actor}${n.actor_count > 1 ? ` and ${n.actor_count - 1} ${n.actor_count === 2 ? "other" : "others"}` : ""} liked your ${n.show_title || "show"} diary entry`;
    case "comment": return `${actor} commented on your ${n.show_title || "show"} diary entry`;
    case "follower": return `${actor} started following you`;
    case "follow_request": return `${actor} requested to follow you`;
    case "follow_accepted": return `${actor} accepted your follow request`;
  }
}
export function notificationDestination(n: InboxItem): string {
  if (n.category === "follow_request") return "/app/profile/requests";
  if (n.entry_id) return `/e/${n.entry_id}${n.category === "comment" ? "#comments" : ""}`;
  return `/@${encodeURIComponent(n.handle)}`;
}
export function notificationDayGroup(timestamp: string, now = new Date()): string {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = (day(now) - day(new Date(timestamp))) / 86400000;
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 7 ? "This week" : "Earlier";
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { notificationText, notificationDestination, notificationDayGroup, type InboxItem } from "../src/lib/notifications";
const item: InboxItem = { id: "n", category: "like", updated_at: "2026-10-31T12:00:00Z", revision: 1, unread: true, actor_id: "a", handle: "alex", display_name: "Alex", avatar_url: null, actor_count: 4, show_title: "Wicked", entry_id: "exact-visit" };
test("grouped like copy and exact visit destination", () => {
  assert.equal(notificationText(item), "Alex and 3 others liked your Wicked diary entry");
  assert.equal(notificationDestination(item), "/e/exact-visit");
  assert.equal(notificationDestination({ ...item, category: "comment" }), "/e/exact-visit#comments");
});
test("follow requests open the actionable requests destination", () => {
  assert.equal(notificationDestination({ ...item, category: "follow_request", entry_id: null }), "/app/profile/requests");
  assert.equal(notificationDestination({ ...item, category: "follow_accepted", entry_id: null }), "/@alex");
});
test("calendar groups use local days including DST boundaries", () => {
  const now = new Date(2026, 9, 31, 12);
  assert.equal(notificationDayGroup(new Date(2026, 9, 31, 0).toISOString(), now), "Today");
  assert.equal(notificationDayGroup(new Date(2026, 9, 30, 23).toISOString(), now), "Yesterday");
  assert.equal(notificationDayGroup(new Date(2026, 9, 26).toISOString(), now), "This week");
  assert.equal(notificationDayGroup(new Date(2026, 9, 20).toISOString(), now), "Earlier");
});

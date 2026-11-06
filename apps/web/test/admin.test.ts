import assert from "node:assert/strict";
import { test } from "node:test";

import { isAdmin, isAdminPath } from "@/lib/admin";

test("isAdmin: only app_metadata.role admin", () => {
  assert.equal(isAdmin({ app_metadata: { role: "admin" } }), true);
  assert.equal(isAdmin({ app_metadata: { role: "user" } }), false);
  assert.equal(isAdmin({ app_metadata: { provider: "google" } }), false);
  assert.equal(isAdmin({ app_metadata: { roles: ["admin"] } }), false);
  assert.equal(isAdmin({}), false);
  assert.equal(isAdmin(null), false);
  assert.equal(isAdmin(undefined), false);
  // user_metadata is editable by the user, so it never counts.
  assert.equal(isAdmin({ user_metadata: { role: "admin" } } as { app_metadata?: unknown }), false);
});

test("isAdminPath: /app/backstage and below only", () => {
  assert.equal(isAdminPath("/app/backstage"), true);
  assert.equal(isAdminPath("/app/backstage/import"), true);
  assert.equal(isAdminPath("/app/backstager"), false);
  assert.equal(isAdminPath("/app/import"), false);
  assert.equal(isAdminPath("/app"), false);
});

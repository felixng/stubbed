// Admins are marked in Supabase Auth, not in our tables: `app_metadata.role`
// is "admin". Only the service role can write app_metadata (set it in the
// Supabase dashboard or SQL, see docs/DECISIONS.md), and it rides in the
// signed session token, so checking it needs no extra query. A user can't
// set it themselves: user_metadata is theirs to edit, app_metadata isn't.
//
// Being an admin only unlocks the admin pages under /app/backstage and the
// testing options their routes accept. Everywhere else an admin sees exactly
// what any other user sees.
export const ADMIN_PATH = "/app/backstage";

export function isAdmin(claims: { app_metadata?: unknown } | null | undefined): boolean {
  const meta = claims?.app_metadata;
  return typeof meta === "object" && meta !== null && (meta as { role?: unknown }).role === "admin";
}

export function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_PATH || pathname.startsWith(`${ADMIN_PATH}/`);
}

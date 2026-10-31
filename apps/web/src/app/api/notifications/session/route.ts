import { createClient } from "@/lib/supabase/server";
// The service worker uses the current verified session, not a persisted auth
// token, to avoid showing previews for a signed-out or different account.
export async function GET() {
  const { data: { user }, error } = await (await createClient()).auth.getUser();
  return Response.json({ user_id: error ? null : user?.id ?? null }, { status: user && !error ? 200 : 401, headers: { "Cache-Control": "no-store, private" } });
}

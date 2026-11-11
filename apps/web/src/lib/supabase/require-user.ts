import { headers } from "next/headers";

import { isAdmin } from "@/lib/admin";
import { bearerToken } from "@/lib/supabase/bearer";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

// For Route Handlers that cost money or hit third-party services: only a
// signed-in user may call them. Returns the user id, or null.
export async function requireUserId(): Promise<string | null> {
  return (await currentUser())?.id ?? null;
}

// The signed-in user, their email (from the verified token, when their account has one) and
// whether they're an admin (see lib/admin), or null.
// The web app signs in with its session cookie; the iOS app sends its access
// token as `Authorization: Bearer`. A request with that header is judged on
// the token alone, never the cookie. getClaims verifies the token's signature
// either way, so a forged or expired token gets null.
export async function currentUser(): Promise<{ id: string; email: string | null; admin: boolean } | null> {
  const token = bearerToken((await headers()).get("authorization"));
  const { data } = token
    ? await createPublicClient().auth.getClaims(token)
    : await (await createClient()).auth.getClaims();
  const sub = data?.claims?.sub;
  const email = data?.claims?.email;
  return typeof sub === "string" ? { id: sub, email: typeof email === "string" && email ? email : null, admin: isAdmin(data?.claims) } : null;
}

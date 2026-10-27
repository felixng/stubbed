import { NextResponse, type NextRequest } from "next/server";

import { importGoogleAvatar } from "@/lib/avatar";
import { oauthProvider } from "@/lib/oauth-provider";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

// Google or Apple sends the browser back here with a one-time code (PKCE).
// Exchanging it sets the session cookies, creating the account the first
// time (then the proxy sends them to /welcome). Failures go back to /login
// with a message.
// A new user's Google photo becomes their avatar (they can change it at
// /welcome); Apple shares no photo.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (data.user) await importGoogleAvatar(supabase, data.user);
      return NextResponse.redirect(new URL(safeNext(searchParams.get("next")), request.url));
    }
    console.error("exchangeCodeForSession failed", error.code, error.message);
  }
  const provider = oauthProvider(searchParams.get("provider")) ?? "google";
  return NextResponse.redirect(new URL(`/login?error=${provider}`, request.url));
}

import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

// The links in Supabase's emails (supabase/templates): confirming a new
// account, and resetting a password. They carry a token hash rather than a
// PKCE code, so they work in any browser, not just the one that asked (a
// phone's mail app, or after signing up in the iOS app). Verifying it signs
// the visitor in; a new account then goes on to /welcome (the proxy sends
// anyone without a handle there), a reset to /reset-password.
const TYPES = new Set<EmailOtpType>(["signup", "email", "recovery", "email_change"]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type && TYPES.has(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const to = type === "recovery" ? "/reset-password" : safeNext(searchParams.get("next"));
      return NextResponse.redirect(new URL(to, request.url));
    }
    console.error("verifyOtp failed", type, error.code, error.message);
  }
  return NextResponse.redirect(new URL(`/login?error=${type === "recovery" ? "reset-link" : "confirm-link"}`, request.url));
}

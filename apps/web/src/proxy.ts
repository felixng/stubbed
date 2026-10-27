import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Signed-in visitors to the landing page go straight to the app. Anyone
  // without a Supabase auth cookie can't be signed in, so they skip the
  // session check and the landing page stays fast and cacheable for them.
  // Public profiles, entries and trips likewise: they need the session only
  // for a signed-in visitor's Follow, Like and Comment, to show a private
  // profile's shows to its approved followers, and to place the join card.
  const { pathname } = request.nextUrl;
  const publicPage = pathname.startsWith("/@") || pathname.startsWith("/e/") || pathname.startsWith("/t/");
  if ((pathname === "/" || publicPage) && !hasAuthCookie(request)) {
    return NextResponse.next();
  }
  return updateSession(request);
}

// Supabase stores the session as sb-<project>-auth-token, sometimes split
// into .0, .1, … chunks.
function hasAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));
}

// Only signed-in surfaces need the session refreshed, plus the landing page
// so signed-in users can be sent on to the app, and public profiles, entries
// and trips for follows, likes, comments and the join card.
export const config = {
  matcher: ["/", "/app/:path*", "/login", "/signup", "/reset-password", "/welcome", "/auth/:path*", "/@:handle", "/@:handle/:list", "/e/:id", "/t/:id"],
};

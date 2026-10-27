import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdmin, isAdminPath } from "@/lib/admin";
import { supabaseEnv } from "@/lib/env";
import { ONBOARDED_COOKIE } from "@/lib/profile-handle";
import { safeNext } from "@/lib/safe-next";

// Refreshes the Supabase session cookie once per navigation, before any
// Server Component reads it, and guards the owner app (#13): /app/* without a
// session goes to /login, and the landing page, /login or /signup with a
// session goes to /app. /reset-password needs the session its email link
// gives. Admin pages (/app/admin/*) are a 404 for everyone else, before
// anything renders.
// Signed-in users without a handle go to /welcome to set up their profile
// first. This is a convenience, not the security boundary: RLS in Postgres
// and the checks in each admin page and route are.
export async function updateSession(request: NextRequest) {
  const { url, key } = supabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [header, value] of Object.entries(headers ?? {})) {
          response.headers.set(header, value);
        }
      },
    },
  });

  // Don't run code between createServerClient and getClaims(): it would make
  // random sign-outs hard to debug.
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  const { pathname, search } = request.nextUrl;
  const inApp = pathname === "/app" || pathname.startsWith("/app/");
  const welcome = pathname === "/welcome";

  if (!userId && (inApp || welcome)) {
    const login = new URL("/login", request.url);
    if (inApp) login.searchParams.set("next", pathname + search);
    return redirectWithCookies(login, response);
  }
  if (userId && isAdminPath(pathname) && !isAdmin(data?.claims)) {
    // A path no page answers, so Next renders its 404 with a 404 status.
    return withCookies(NextResponse.rewrite(new URL("/app-admin-not-found", request.url)), response);
  }
  if (!userId && pathname === "/reset-password") {
    return redirectWithCookies(new URL("/login?error=reset-link", request.url), response);
  }
  if (userId && (pathname === "/" || pathname === "/login" || pathname === "/signup")) {
    return redirectWithCookies(new URL("/app", request.url), response);
  }

  if (userId && (inApp || welcome)) {
    const remembered = request.cookies.get(ONBOARDED_COOKIE)?.value === userId;
    const onboarded = remembered || (await hasHandle(supabase, userId));
    if (inApp && !onboarded) {
      const setup = new URL("/welcome", request.url);
      setup.searchParams.set("next", pathname + search);
      return redirectWithCookies(setup, response);
    }
    if (welcome && onboarded) {
      const next = safeNext(request.nextUrl.searchParams.get("next"));
      return redirectWithCookies(new URL(next, request.url), response);
    }
    if (onboarded && !remembered) {
      response.cookies.set(ONBOARDED_COOKIE, userId, {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }

  return response;
}

async function hasHandle(supabase: ReturnType<typeof createServerClient>, userId: string) {
  const { data } = await supabase.from("profiles").select("handle").eq("id", userId).maybeSingle();
  return Boolean(data?.handle);
}

// A redirect or rewrite must carry any cookies the refresh just set or
// cleared, or the browser and server drift out of sync.
function redirectWithCookies(to: URL, from: NextResponse) {
  return withCookies(NextResponse.redirect(to), from);
}

function withCookies(to: NextResponse, from: NextResponse) {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
  return to;
}

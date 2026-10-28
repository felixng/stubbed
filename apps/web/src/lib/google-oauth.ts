// Google sign-in with our own button (#179): Google's popup (Google Identity
// Services' code client, so it names getstubbed.app) hands the browser a
// one-time code; the server trades it for Google's ID token here, with the
// client secret, and gives that to Supabase's signInWithIdToken.

export type GoogleTokens = { idToken: string; accessToken: string | null };

export type ExchangeResult =
  | { ok: true; tokens: GoogleTokens }
  | { ok: false; reason: "not-configured" | "failed" };

export function googleOAuthConfig(env: Record<string, string | undefined> = process.env) {
  const clientId = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export async function exchangeGoogleCode(
  code: string,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<ExchangeResult> {
  const config = googleOAuthConfig(env);
  if (!config) return { ok: false, reason: "not-configured" };
  if (!code || code.length > 2048) return { ok: false, reason: "failed" };
  try {
    const res = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        // The popup code flow's fixed redirect URI.
        redirect_uri: "postmessage",
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => ({}))) as { id_token?: unknown; access_token?: unknown; error?: unknown };
    if (!res.ok || typeof body.id_token !== "string") {
      console.error("Google code exchange failed", res.status, body.error);
      return { ok: false, reason: "failed" };
    }
    return {
      ok: true,
      tokens: { idToken: body.id_token, accessToken: typeof body.access_token === "string" ? body.access_token : null },
    };
  } catch (error) {
    console.error("Google code exchange failed", error);
    return { ok: false, reason: "failed" };
  }
}

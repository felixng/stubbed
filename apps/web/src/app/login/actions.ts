"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { importGoogleAvatar } from "@/lib/avatar";
import { exchangeGoogleCode } from "@/lib/google-oauth";
import { oauthProvider } from "@/lib/oauth-provider";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { email?: string; error?: string };
export type SignUpState = { email?: string; error?: string; sent?: boolean };
export type ResetState = { email?: string; error?: string; sent?: boolean };

// Supabase's own minimum is lower (supabase/config.toml); new passwords need 8.
const MIN_PASSWORD = 8;

// This site's origin, for links in emails and OAuth callbacks.
async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

// Email + password. One message for every failure, so the form never reveals
// which emails have an account.
export async function signInWithPassword(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { email, error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "over_request_rate_limit") {
      return { email, error: "Too many attempts. Wait a minute, then try again." };
    }
    return { email, error: "Email or password is incorrect." };
  }
  redirect(safeNext(formData.get("next")));
}

// A new account with email + password (#149). Supabase sends an email with a
// link and a code (supabase/templates/confirmation.html); the link lands on
// /auth/confirm, which signs them in and sends them to /welcome for a handle.
// Signing up with an email that already has an account looks the same, so
// the form never reveals who has one.
export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { email, error: "Enter your email and a password." };
  if (password.length < MIN_PASSWORD) return { email, error: `Use at least ${MIN_PASSWORD} characters for your password.` };

  const supabase = await createClient();
  const next = safeNext(formData.get("next"));
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await origin()}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    console.error("signUp failed", error.code, error.message);
    if (error.code === "weak_password") return { email, error: "Choose a stronger password: longer, and not a common one." };
    if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
      return { email, error: "Too many attempts. Wait a few minutes, then try again." };
    }
    if (error.code === "email_address_invalid") return { email, error: "That email address doesn’t look right." };
    return { email, error: "Couldn’t create your account. Try again." };
  }
  // Without email confirmation (local development) they're signed in already.
  if (data.session) redirect(next);
  return { email, sent: true };
}

// "Forgot your password?": an email with a link to /reset-password. The same
// answer whether or not the email has an account.
export async function sendPasswordReset(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { email, error: "Enter your email." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/confirm?type=recovery`,
  });
  if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") {
    return { email, error: "Too many attempts. Wait a few minutes, then try again." };
  }
  if (error) console.error("resetPasswordForEmail failed", error.code, error.message);
  return { email, sent: true };
}

// /reset-password, signed in by the link in the reset email.
export async function updatePassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters.` };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "That’s your current password. Choose a new one." };
    if (error.code === "weak_password") return { error: "Choose a stronger password: longer, and not a common one." };
    if (error.code === "session_not_found" || error.status === 401) {
      return { error: "This reset link has expired. Ask for a new one from the sign-in page." };
    }
    return { error: "Couldn’t change your password. Try again." };
  }
  redirect("/app");
}

// Google or Apple. Supabase returns the provider's consent URL; the provider
// sends the browser back to /auth/callback, which finishes sign-in. A new
// Google or Apple account is created on the way, then goes to /welcome.
export async function signInWithProvider(formData: FormData) {
  const provider = oauthProvider(formData.get("provider"));
  if (!provider) redirect("/login");

  const callback = new URL("/auth/callback", await origin());
  callback.searchParams.set("next", safeNext(formData.get("next")));
  callback.searchParams.set("provider", provider);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: callback.toString() },
  });
  if (error || !data.url) {
    console.error("signInWithOAuth failed", provider, error?.code, error?.message);
    redirect(`/login?error=${provider}`);
  }
  redirect(data.url);
}

// Google with our own button (GoogleButton): Google's popup gives the
// browser a one-time code, which is traded here for Google's ID token
// (lib/google-oauth) and handed to Supabase, which sets the session cookies.
// A new account's Google photo becomes its avatar, as /auth/callback does.
// "not-configured" (no client secret on this deployment) tells the button to
// use the redirect flow instead.
export async function signInWithGoogleCode(code: string): Promise<{ error?: "not-configured" | "failed" }> {
  const result = await exchangeGoogleCode(code);
  if (!result.ok) return { error: result.reason };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: result.tokens.idToken,
    access_token: result.tokens.accessToken ?? undefined,
  });
  if (error) {
    console.error("signInWithIdToken (Google) failed", error.code, error.message);
    return { error: "failed" };
  }
  if (data.user) await importGoogleAvatar(supabase, data.user);
  return {};
}

export async function signOut() {
  const supabase = await createClient();
  // This device only; the phone stays signed in if signing out on a laptop.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

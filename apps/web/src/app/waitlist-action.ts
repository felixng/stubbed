"use server";

import { kitConfigured, subscribeToKit } from "@/lib/kit";
import { SITE_URL } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export type WaitlistState =
  | { status: "idle" }
  // `confirm`: a confirmation email is on its way (Kit's double opt-in).
  | { status: "success"; confirm: boolean }
  | { status: "error"; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sends sign-ups to Kit, which emails a double opt-in confirmation (see
// docs/DECISIONS.md). Until Kit is configured (local dev, or before the keys
// are set in Vercel) it falls back to the `waitlist` table from #10, so no
// sign-up is lost. Either way a duplicate email reports success and the form
// never reveals who is already on the list.
export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  // Honeypot: real people never see this field, bots fill it in.
  if (formData.get("company")) return { status: "success", confirm: true };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return { status: "error", message: "Please enter a valid email address." };
  }
  const source =
    String(formData.get("source") ?? "").trim().slice(0, 100) || null;

  if (kitConfigured()) {
    try {
      await subscribeToKit(email, referrerUrl(source));
    } catch (error) {
      console.error("waitlist subscribe failed", error);
      return {
        status: "error",
        message: "Couldn’t add you to the waitlist. Try again in a moment.",
      };
    }
    return { status: "success", confirm: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("waitlist").insert({ email, source });
  // 23505 = unique violation: already on the list.
  if (error && error.code !== "23505") {
    console.error("waitlist insert failed", error);
    return {
      status: "error",
      message: "Couldn’t add you to the waitlist. Try again in a moment.",
    };
  }
  return { status: "success", confirm: false };
}

// Kit tracks sources through utm_* on the referrer URL. The form sends either a
// bare utm_source/ref value or the page's document.referrer.
function referrerUrl(source: string | null) {
  if (!source) return null;
  if (/^https?:\/\//.test(source)) return source;
  const url = new URL(SITE_URL);
  url.searchParams.set("utm_source", source);
  return url.href;
}

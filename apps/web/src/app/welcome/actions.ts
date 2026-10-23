"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  BIO_MAX,
  NAME_MAX,
  ONBOARDED_COOKIE,
  handleProblem,
  isReservedHandleError,
  normalizeHandle,
  normalizeLink,
} from "@/lib/profile-handle";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

export type ProfileFields = { name: string; handle: string; bio: string; link: string };
export type WelcomeState = {
  values?: ProfileFields;
  errors?: Partial<Record<keyof ProfileFields | "form", string>>;
};

// Saves the onboarding profile. RLS limits the update to the user's own row;
// the handle's uniqueness and format are enforced by Postgres too.
export async function completeProfile(_prev: WelcomeState, formData: FormData): Promise<WelcomeState> {
  const values: ProfileFields = {
    name: String(formData.get("name") ?? "").trim(),
    handle: normalizeHandle(String(formData.get("handle") ?? "")),
    bio: String(formData.get("bio") ?? "").trim(),
    link: String(formData.get("link") ?? "").trim(),
  };
  const link = normalizeLink(values.link);

  const errors: WelcomeState["errors"] = {};
  if (!values.name) errors.name = "Add your name.";
  else if (values.name.length > NAME_MAX) errors.name = `At most ${NAME_MAX} characters.`;
  const handleError = handleProblem(values.handle);
  if (handleError) errors.handle = handleError;
  if (values.bio.length > BIO_MAX) errors.bio = `At most ${BIO_MAX} characters.`;
  if (values.link && !link) errors.link = "That doesn’t look like a web link.";
  if (Object.keys(errors).length) return { values, errors };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (!userId) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: values.name, handle: values.handle, bio: values.bio || null, link })
    .eq("id", userId);
  if (error) {
    if (error.code === "23505") return { values, errors: { handle: "That handle is taken." } };
    if (isReservedHandleError(error)) return { values, errors: { handle: "That handle is reserved. Try another." } };
    console.error("completeProfile failed", error.code, error.message);
    return { values, errors: { form: "Couldn’t save your profile. Try again." } };
  }

  // The proxy would set this on the next request anyway; setting it here
  // saves that lookup.
  (await cookies()).set(ONBOARDED_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(safeNext(formData.get("next")));
}

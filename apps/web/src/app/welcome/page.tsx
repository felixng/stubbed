import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { Wordmark } from "@/components/ui/Wordmark";
import { createClient } from "@/lib/supabase/server";
import { WelcomeForm } from "./WelcomeForm";

// Onboarding: the proxy sends signed-in users without a handle here before
// they reach /app, and sends everyone else on.
export const metadata: Metadata = {
  title: "Set up your profile — Stubbed",
  robots: { index: false, follow: false },
};

// Always light, like the app and sign-in (owner's call).
export const viewport: Viewport = { themeColor: "#fff9f6" };

// Prefills what we already know: a name saved earlier, or the one Google gave us.
async function Form({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  await connection();
  const { next } = await searchParams;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  const { data: profile } = userId
    ? await supabase.from("profiles").select("display_name, bio, link, avatar_url").eq("id", userId).maybeSingle()
    : { data: null };
  const meta = (claims?.claims?.user_metadata ?? {}) as Record<string, unknown>;
  const googleName = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : "";

  return (
    <WelcomeForm
      userId={userId}
      avatarUrl={profile?.avatar_url ?? null}
      next={typeof next === "string" ? next : ""}
      initial={{
        name: (profile?.display_name ?? googleName).slice(0, 50),
        handle: "",
        bio: profile?.bio ?? "",
        link: profile?.link ?? "",
      }}
    />
  );
}

export default function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  return (
    <main data-theme="light" className="flex flex-1 flex-col items-center bg-background px-4 py-12">
      <div className="flex w-full max-w-[420px] flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Wordmark size={36} mark />
          <h1 className="text-title-2 font-display text-label">Set up your profile</h1>
          <p className="text-subheadline text-label-secondary">
            Your handle goes on your share cards and profile link.
          </p>
        </div>
        <Suspense fallback={<p className="text-center text-subheadline text-label-secondary">Loading…</p>}>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

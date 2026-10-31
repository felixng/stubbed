import type { Metadata } from "next";
import { Suspense } from "react";

import { PrivacyForm } from "@/components/app/PrivacyForm";
import { BackLink } from "@/components/ui/BackLink";
import { getOwnProfile, ownerContext } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Profile privacy" };

async function Form() {
  const [{ userId }, profile] = await Promise.all([ownerContext(), getOwnProfile()]);
  if (!userId || !profile) return null;
  return <PrivacyForm userId={userId} initial={profile.is_private} />;
}

export default function PrivacyPage() {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <BackLink href="/app/settings">Settings</BackLink>
        <h1 className="text-title font-display text-label">Profile privacy</h1>
      </div>
      <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}><Form /></Suspense>
    </section>
  );
}

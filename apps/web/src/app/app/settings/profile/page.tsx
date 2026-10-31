import type { Metadata } from "next";
import { Suspense } from "react";

import { ProfileForm } from "@/components/app/ProfileForm";
import { BackLink } from "@/components/ui/BackLink";
import { getOwnProfile, ownerContext } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Edit profile" };

async function Form() {
  const [{ userId }, profile] = await Promise.all([ownerContext(), getOwnProfile()]);
  if (!userId || !profile) return null;
  return <ProfileForm userId={userId} initial={profile} />;
}

async function Heading({ searchParams }: Pick<PageProps<"/app/settings/profile">, "searchParams">) {
  const fromSettings = (await searchParams).from === "settings";
  return (
    <div>
      <BackLink href={fromSettings ? "/app/settings" : "/app/profile"}>{fromSettings ? "Settings" : "Profile"}</BackLink>
      <h1 className="text-title font-display text-label">Edit profile</h1>
    </div>
  );
}

export default function EditProfilePage({ searchParams }: PageProps<"/app/settings/profile">) {
  return (
    <section className="flex flex-col gap-5">
      <Suspense fallback={<h1 className="text-title font-display text-label">Edit profile</h1>}>
        <Heading searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
        <Form />
      </Suspense>
    </section>
  );
}

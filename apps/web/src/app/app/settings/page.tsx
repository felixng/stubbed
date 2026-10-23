import type { Metadata } from "next";
import { Suspense } from "react";

import { DeleteAccountButton } from "@/components/app/DeleteAccountButton";
import { ProfileForm } from "@/components/app/ProfileForm";
import { BackLink } from "@/components/ui/BackLink";
import { getOwnProfile, ownerContext } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Edit profile" };

const loading = <p className="text-subheadline text-label-secondary">Loading…</p>;

async function Form() {
  const [{ userId }, profile] = await Promise.all([ownerContext(), getOwnProfile()]);
  if (!userId) return null;
  return (
    <ProfileForm
      userId={userId}
      initial={profile ?? { handle: null, display_name: null, bio: null, link: null, avatar_url: null, is_private: false }}
    />
  );
}

async function DeleteAccount() {
  const profile = await getOwnProfile();
  // Everyone in the app has a handle (the proxy sends others to /welcome).
  return profile?.handle ? <DeleteAccountButton handle={profile.handle} /> : null;
}

// Everything on the public profile (/@handle) and whether it is private,
// then account deletion. Reached from "Edit profile" on the Profile tab.
export default function SettingsPage() {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <BackLink href="/app/profile">Profile</BackLink>
        <h1 className="text-title font-display text-label">Edit profile</h1>
      </div>
      <Suspense fallback={loading}>
        <Form />
      </Suspense>
      <section aria-labelledby="delete-heading" className="flex flex-col gap-2 border-t border-separator pt-5">
        <h2 id="delete-heading" className="text-title-2 font-display text-label">
          Delete account
        </h2>
        <p className="text-subheadline text-label-secondary">
          Permanently delete your profile, diary, trips and photos. This can’t be undone.
        </p>
        <Suspense fallback={null}>
          <DeleteAccount />
        </Suspense>
      </section>
    </section>
  );
}

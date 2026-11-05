import type { Metadata } from "next";
import { Suspense } from "react";

import { Group, SettingsLink, settingsRow } from "@/components/app/SettingsGroup";
import { SignOutButton } from "@/components/notifications/SignOutButton";
import { DeleteAccountButton } from "@/components/app/DeleteAccountButton";
import { BackLink } from "@/components/ui/BackLink";
import { getOwnProfile } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Settings" };
async function PublicProfile() {
  const profile = await getOwnProfile();
  return profile?.handle ? <SettingsLink href={`/@${profile.handle}`}>View public profile</SettingsLink> : null;
}

async function DeleteAccount() {
  const profile = await getOwnProfile();
  return profile?.handle ? <DeleteAccountButton handle={profile.handle} asRow /> : null;
}

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <BackLink href="/app/profile">Profile</BackLink>
        <h1 className="text-title font-display text-label">Settings</h1>
      </div>
      <Group title="Profile">
        <SettingsLink href="/app/settings/profile?from=settings">Edit profile</SettingsLink>
        <Suspense fallback={<p className="p-4 text-subheadline text-label-secondary">Loading…</p>}><PublicProfile /></Suspense>
      </Group>
      <Group title="Notifications"><SettingsLink href="/app/settings/notifications">Notifications</SettingsLink></Group>
      <Group title="Privacy">
        <SettingsLink href="/app/settings/privacy">Profile privacy</SettingsLink>
        <SettingsLink href="/app/settings/blocked">Blocked accounts</SettingsLink>
      </Group>
      <Group title="Your diary">
        <SettingsLink href="/app/import">Import shows</SettingsLink>
      </Group>
      <Group title="Help and information">
        <SettingsLink href="mailto:support@getstubbed.app" external>Contact us</SettingsLink>
        <SettingsLink href="/about" external>About Stubbed</SettingsLink>
        <SettingsLink href="/faq" external>FAQ</SettingsLink>
        <SettingsLink href="/privacy" external>Privacy policy</SettingsLink>
        <SettingsLink href="/terms" external>Terms</SettingsLink>
      </Group>
      <Group title="Account">
        <SignOutButton className={`${settingsRow} w-full cursor-pointer text-destructive`} />
        <Suspense fallback={<p className="p-4 text-subheadline text-label-secondary">Loading…</p>}><DeleteAccount /></Suspense>
      </Group>
    </div>
  );
}

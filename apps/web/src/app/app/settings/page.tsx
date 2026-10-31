import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { signOut } from "@/app/login/actions";
import { DeleteAccountButton } from "@/components/app/DeleteAccountButton";
import { BackLink } from "@/components/ui/BackLink";
import { getOwnProfile } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Settings" };
const row = "flex min-h-12 items-center justify-between gap-3 px-4 py-3 text-body hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";

function SettingsLink({ href, children, external = false }: { href: string; children: React.ReactNode; external?: boolean }) {
  return (
    <Link href={href} className={`${row} text-label`}>
      {children}
      <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-label-secondary">
        <path d={external ? "M7 17 17 7M7 7h10v10" : "m9 5 7 7-7 7"} />
      </svg>
    </Link>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="px-1 text-subheadline font-medium text-label-secondary">{title}</h2>
      <div className="divide-y divide-separator overflow-hidden rounded-md border border-separator bg-surface shadow-sm">{children}</div>
    </section>
  );
}

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
        <SettingsLink href="/faq" external>FAQ</SettingsLink>
        <SettingsLink href="/privacy" external>Privacy policy</SettingsLink>
        <SettingsLink href="/terms" external>Terms</SettingsLink>
      </Group>
      <Group title="Account">
        <form action={signOut}>
          <button type="submit" className={`${row} w-full cursor-pointer text-destructive`}>Sign out</button>
        </form>
        <Suspense fallback={<p className="p-4 text-subheadline text-label-secondary">Loading…</p>}><DeleteAccount /></Suspense>
      </Group>
    </div>
  );
}

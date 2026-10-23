import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { FollowButton } from "@/components/profile/FollowButton";
import { ProfileCalendar } from "@/components/profile/ProfileCalendar";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { PublicEntryCard } from "@/components/profile/PublicEntryCard";
import { getPublicProfile } from "@/lib/profile";
import { count } from "@/lib/plural";
import { NO_REACTIONS } from "@/lib/reactions";

// Public profile, served at /@handle (rewritten here in next.config.ts).
// Every user has one (the handle is set at /welcome). It shows public entries
// only, and a private profile shows just its header, except to its approved
// followers. Entries are read through the publishable key, never the
// visitor's session, except for those followers (lib/profile).
// Always light, set by the layout (docs/DESIGN.md).

export async function generateMetadata({ params }: PageProps<"/u/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const data = await getPublicProfile(handle);
  if (!data) return { title: "Not found — Stubbed", robots: { index: false } };
  const { profile, stats } = data;
  const name = profile.display_name ? `${profile.display_name} (@${profile.handle})` : `@${profile.handle}`;
  const description = stats && !profile.is_private
    ? `${count(stats.shows, "show")} at ${count(stats.venues, "theatre")}. ${name}’s theatre diary on Stubbed.`
    : `${name}’s theatre diary on Stubbed is private.`;
  return {
    title: `${name} — Stubbed`,
    description,
    // Nothing worth indexing on a private profile.
    ...(profile.is_private ? { robots: { index: false } } : {}),
    alternates: { canonical: `/@${profile.handle}` },
    openGraph: { type: "profile", title: name, description, url: `/@${profile.handle}`, username: profile.handle },
  };
}

async function Profile({ params }: PageProps<"/u/[handle]">) {
  const { handle } = await params;
  const data = await getPublicProfile(handle);
  if (!data) notFound();
  const { profile, viewer, follows, stats, entries, photos, reactions } = data;

  const cover = entries
    .flatMap((e) => (e.photo_path && photos.get(e.photo_path) ? [photos.get(e.photo_path)!] : []))
    .slice(0, 5);
  const name = profile.display_name || `@${profile.handle}`;

  return (
    <>
      <ProfileHeader
        profile={profile}
        cover={cover}
        stats={stats}
        follows={follows}
        action={<FollowButton profileId={profile.id} handle={profile.handle} isPrivate={profile.is_private} viewer={viewer} />}
      />

      {!stats ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-separator bg-surface px-6 py-12 text-center shadow-sm">
          <h2 className="text-headline text-label">This profile is private</h2>
          <p className="max-w-[320px] text-subheadline text-label-secondary">
            {viewer?.isOwner
              ? "Only people you approve see your shows. This is what everyone else sees."
              : viewer?.status === "pending"
                ? `Your request is with @${profile.handle}. Their shows appear here once they approve it.`
                : `Follow @${profile.handle} to see their shows. They approve each follower.`}
          </p>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-separator bg-surface px-6 py-12 text-center shadow-sm">
          <h2 className="text-headline text-label">No public shows yet</h2>
          <p className="max-w-[320px] text-subheadline text-label-secondary">
            When @{profile.handle} logs a public show, it’ll appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1">
            <ProfileCalendar entries={entries.map((e) => ({ id: e.id, date: e.date, title: e.show.title }))} />
          </div>
          <section aria-labelledby="recent-heading" className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1">
            <h2 id="recent-heading" className="text-title-2 font-display text-label">
              Recent shows
            </h2>
            {entries.map((e) => (
              <PublicEntryCard
                key={e.id}
                entry={e}
                photoUrl={e.photo_path ? photos.get(e.photo_path) : undefined}
                handle={profile.handle}
                name={name}
                avatarUrl={profile.avatar_url}
                social={{ viewerId: viewer?.id ?? null, reactions: reactions.get(e.id) ?? NO_REACTIONS }}
                loginNext={`/@${profile.handle}`}
              />
            ))}
          </section>
        </div>
      )}
    </>
  );
}

export default function ProfilePage(props: PageProps<"/u/[handle]">) {
  return (
    <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
      <Profile {...props} />
    </Suspense>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Diary } from "@/components/app/Diary";
import { FollowRequests } from "@/components/app/FollowRequests";
import { TripsList } from "@/components/app/TripsList";
import { Avatar } from "@/components/profile/Avatar";
import { getFollowCounts, listFollowRequests } from "@/lib/follows";
import { getOwnProfile, ownerContext } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Profile" };

const loading = <p className="text-subheadline text-label-secondary">Loading…</p>;

const PILL =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-pill bg-fill px-4 text-[15px] leading-5 font-semibold text-label hover:bg-tint-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// Who you are, Hevy style: avatar, handle, name and bio, then shows,
// followers and following (linking to the lists, where followers can be
// removed), any follow requests to approve, and buttons to edit the profile
// (/app/settings) and see it as others do (/@handle).
async function Header() {
  const { supabase, userId } = await ownerContext();
  if (!userId) return null;
  const logged = () =>
    supabase.from("entries").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "logged");
  const [profile, counts, requests, { count: shows }, { count: publicShows }] = await Promise.all([
    getOwnProfile(),
    getFollowCounts(supabase, userId),
    listFollowRequests(supabase, userId),
    logged(),
    logged().eq("visibility", "public"),
  ]);
  // This count includes private shows; /@handle counts public ones only, so
  // say how many visitors don't see rather than let the two numbers disagree.
  const hidden = (shows ?? 0) - (publicShows ?? 0);
  if (!profile?.handle) return null;
  const name = profile.display_name || `@${profile.handle}`;
  const stats: [string, number, string | null][] = [
    [shows === 1 ? "Show" : "Shows", shows ?? 0, null],
    [counts.followers === 1 ? "Follower" : "Followers", counts.followers, `/@${profile.handle}/followers`],
    ["Following", counts.following, `/@${profile.handle}/following`],
  ];

  return (
    <section aria-labelledby="profile-handle" className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar name={name} url={profile.avatar_url} size={80} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 id="profile-handle" className="truncate text-title font-display text-label">
            @{profile.handle}
          </h1>
          {profile.display_name && <p className="truncate text-subheadline text-label-secondary">{profile.display_name}</p>}
          {profile.is_private && <p className="text-footnote text-label-secondary">Private profile</p>}
        </div>
      </div>
      {profile.bio && <p className="whitespace-pre-line text-body text-label">{profile.bio}</p>}
      <dl className="flex gap-8">
        {stats.map(([label, value, href]) => (
          <div key={label} className="flex flex-col-reverse">
            <dt className="text-footnote text-label-secondary">{label}</dt>
            <dd className="text-title-2 font-display text-label tabular-nums">
              {href ? (
                <Link href={href} aria-label={`${value} ${label.toLowerCase()}`} className="underline-offset-2 hover:underline">
                  {value}
                </Link>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
      </dl>
      {hidden > 0 && !profile.is_private && (
        <p className="-mt-2 text-footnote text-label-secondary">
          {hidden === 1 ? "1 private show isn’t" : `${hidden} private shows aren’t`} on your public profile.
        </p>
      )}
      {/* Only private profiles get requests; going public approves them all. */}
      {requests.length > 0 && (
        <section aria-labelledby="requests-heading" className="flex flex-col gap-3">
          <h2 id="requests-heading" className="text-headline text-label">
            {requests.length === 1 ? "1 follow request" : `${requests.length} follow requests`}
          </h2>
          <FollowRequests ownerId={userId} people={requests} />
        </section>
      )}
      <div className="flex gap-3">
        <Link href="/app/settings" className={PILL}>
          Edit profile
        </Link>
        <Link href={`/@${profile.handle}`} className={PILL}>
          View public profile
        </Link>
      </div>
    </section>
  );
}

const VIEWS = [
  { id: "diary", label: "Diary" },
  { id: "trips", label: "Trips" },
] as const;

async function Body({ searchParams }: { searchParams: PageProps<"/app/profile">["searchParams"] }) {
  const { view } = await searchParams;
  const active = view === "trips" ? "trips" : "diary";
  return (
    <>
      <nav aria-label="Profile sections" className="flex rounded-pill bg-fill p-1">
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            href={v.id === "diary" ? "/app/profile" : `/app/profile?view=${v.id}`}
            aria-current={active === v.id ? "page" : undefined}
            className={`flex min-h-9 flex-1 items-center justify-center rounded-pill text-subheadline font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              active === v.id ? "bg-surface text-label shadow-sm" : "text-label-secondary hover:text-label"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      {active === "trips" ? (
        <section aria-label="Trips" className="flex flex-col gap-3">
          <Link
            href="/app/trips/new"
            className="self-end text-subheadline font-semibold text-tint-text underline-offset-2 hover:underline"
          >
            + New trip
          </Link>
          <Suspense fallback={loading}>
            <TripsList />
          </Suspense>
        </section>
      ) : (
        <section aria-label="Diary" className="flex flex-col gap-5">
          <Suspense fallback={loading}>
            <Diary />
          </Suspense>
        </section>
      )}
    </>
  );
}

// The Profile tab: you, then your diary or your trips. Editing the profile
// and deleting the account live on /app/settings.
export default function ProfilePage({ searchParams }: PageProps<"/app/profile">) {
  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={loading}>
        <Header />
      </Suspense>
      <Suspense fallback={loading}>
        <Body searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

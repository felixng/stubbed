import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Diary } from "@/components/app/Diary";
import { OwnerProfileMenu } from "@/components/app/OwnerProfileMenu";
import { TripsList } from "@/components/app/TripsList";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { PlaceholderRows } from "@/components/ui/PlaceholderRows";
import { signPhotos } from "@/lib/entries";
import { getFollowCounts, listFollowRequests } from "@/lib/follows";
import { count } from "@/lib/plural";
import type { ProfileStats } from "@/lib/profile";
import { getOwnProfile, ownerContext } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Profile" };

const loading = <p className="text-subheadline text-label-secondary">Loading…</p>;

type OwnStats = ProfileStats & { public_shows: number };

// The public profile's header (ProfileHeader, as on /@handle), with the
// owner's controls: Edit profile and a menu with the public view, a row for
// follow requests, and a note on how many private shows the public profile
// leaves out. The stats count every logged show (own_profile_stats), private
// ones included, since only the owner sees this page.
async function Header() {
  const { supabase, userId } = await ownerContext();
  if (!userId) return null;
  const [profile, follows, requests, { data: stats }, { data: covers }] = await Promise.all([
    getOwnProfile(),
    getFollowCounts(supabase, userId),
    listFollowRequests(supabase, userId),
    supabase.rpc("own_profile_stats").single<OwnStats>(),
    supabase
      .from("entries")
      .select("photo_path")
      .eq("user_id", userId)
      .eq("status", "logged")
      .not("photo_path", "is", null)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  if (!profile?.handle) return null;
  const paths = (covers ?? []).map((c) => c.photo_path as string);
  const signed = await signPhotos(supabase, paths);
  const cover = paths.flatMap((p) => (signed.get(p) ? [signed.get(p)!] : []));
  const own = stats ?? { shows: 0, venues: 0, cities: 0, public_shows: 0 };
  // These numbers include private shows; /@handle counts public ones only, so
  // say how many visitors don't see rather than let the two disagree. A
  // private profile hides everything from visitors anyway.
  const hidden = own.shows - own.public_shows;

  return (
    <ProfileHeader
      profile={{ ...profile, handle: profile.handle }}
      cover={cover}
      stats={own}
      follows={follows}
      action={
        <>
          <Link
            href="/app/settings"
            className="inline-flex min-h-11 items-center justify-center rounded-pill bg-tint-fill px-4 text-subheadline font-semibold text-tint-text hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Edit profile
          </Link>
          <OwnerProfileMenu handle={profile.handle} />
        </>
      }
    >
      {hidden > 0 && !profile.is_private && (
        <p className="-mt-1 text-footnote text-label-secondary">
          {count(hidden, "private show")} {hidden === 1 ? "isn’t" : "aren’t"} on your public profile.
        </p>
      )}
      {/* Only private profiles get requests; going public approves them all. */}
      {requests.length > 0 && (
        <Link
          href="/app/profile/requests"
          className="-mx-4 -mb-4 flex min-h-11 rounded-b-md items-center justify-between gap-3 border-t border-separator px-4 text-subheadline font-semibold text-tint-text hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus sm:-mx-6 sm:-mb-5 sm:px-6"
        >
          {count(requests.length, "follow request")}
          <svg
            viewBox="0 0 24 24"
            width={20}
            height={20}
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="flex-none"
          >
            <path d="M9.5 5.5 16 12l-6.5 6.5" />
          </svg>
        </Link>
      )}
    </ProfileHeader>
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
            className="-my-2 -mr-3 self-end inline-flex min-h-11 items-center rounded-pill px-3 text-subheadline font-semibold text-tint-text hover:bg-tint-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            + New trip
          </Link>
          <Suspense fallback={<PlaceholderRows />}>
            <TripsList />
          </Suspense>
        </section>
      ) : (
        <section aria-label="Diary" className="flex flex-col gap-5">
          <Suspense fallback={<PlaceholderRows />}>
            <Diary />
          </Suspense>
        </section>
      )}
    </>
  );
}

// The Profile tab: your profile as others see it, with your controls, then
// your diary (with the calendar) or your trips. Editing the profile and
// deleting the account live on /app/settings.
export default function ProfilePage({ searchParams }: PageProps<"/app/profile">) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={loading}>
        <Header />
      </Suspense>
      <Suspense fallback={loading}>
        <Body searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

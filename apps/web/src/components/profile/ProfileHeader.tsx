import Link from "next/link";

import { Avatar } from "@/components/profile/Avatar";
import type { FollowCounts } from "@/lib/follows";
import { plural } from "@/lib/plural";
import type { ProfileStats } from "@/lib/profile";

export type HeaderProfile = {
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  link: string | null;
  is_private: boolean;
};

// "https://www.instagram.com/you/" → "instagram.com/you"
function displayLink(link: string) {
  return link.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

// One profile header for /@handle and the Profile tab: a cover of recent
// photos, the avatar with the page's action beside it (Follow for visitors,
// Edit profile and a menu for the owner), handle, name, bio, link, follow
// counts and the stats. What it shows is decided by the caller, which reads
// it through Postgres: visitors get public_profile_stats (public shows only,
// or no stats on a private profile they can't see), the owner gets
// own_profile_stats (every logged show). `children` sits at the bottom of the
// card, for the owner's notes and follow requests.
export function ProfileHeader({
  profile,
  cover,
  stats,
  follows,
  action,
  children,
}: {
  profile: HeaderProfile;
  cover: string[];
  stats: ProfileStats | null;
  follows: FollowCounts;
  action: React.ReactNode;
  children?: React.ReactNode;
}) {
  const name = profile.display_name || `@${profile.handle}`;
  const lists = [
    ["followers", follows.followers, plural(follows.followers, "follower")],
    ["following", follows.following, "following"],
  ] as const;

  return (
    <section aria-labelledby="profile-name" className="rounded-md border border-separator bg-surface shadow-sm">
      {/* No overflow-hidden on the card, so the owner's menu can drop below it. */}
      {cover.length > 0 ? (
        <div className="flex h-24 gap-0.5 overflow-hidden rounded-t-md bg-fill sm:h-44">
          {cover.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, EXIF stripped on upload
            <img key={src} src={src} alt="" className={`min-w-0 flex-1 object-cover ${i >= 3 ? "hidden sm:block" : ""}`} />
          ))}
        </div>
      ) : (
        <div aria-hidden="true" className="h-16 rounded-t-md bg-tint-fill sm:h-28" />
      )}
      <div className="flex flex-col gap-3 px-4 pb-4 sm:gap-4 sm:px-6 sm:pb-5">
        <div className="flex items-end justify-between gap-3">
          <Avatar name={name} url={profile.avatar_url} size={80} className="-mt-10 ring-4 ring-surface" />
          <div className="flex items-center gap-1">{action}</div>
        </div>
        <div className="flex flex-col gap-0.5">
          <h1 id="profile-name" className="truncate text-title font-display text-label">
            @{profile.handle}
          </h1>
          {profile.display_name && <p className="truncate text-subheadline text-label-secondary">{profile.display_name}</p>}
          <p className="mt-1 flex flex-wrap gap-x-4 text-subheadline text-label-secondary">
            {lists.map(([list, value, label]) => (
              <Link
                key={list}
                href={`/@${profile.handle}/${list}`}
                className="rounded-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <span className="font-semibold text-label tabular-nums">{value}</span> {label}
              </Link>
            ))}
            {profile.is_private && <span>Private profile</span>}
          </p>
        </div>
        {(profile.bio || profile.link) && (
          <div className="flex flex-col gap-1">
            {profile.bio && <p className="whitespace-pre-line text-body text-label">{profile.bio}</p>}
            {profile.link && (
              <a
                href={profile.link}
                rel="nofollow ugc noopener noreferrer"
                target="_blank"
                className="w-fit max-w-full truncate text-subheadline font-semibold text-tint-text underline-offset-2 hover:underline"
              >
                {displayLink(profile.link)}
              </a>
            )}
          </div>
        )}
        {stats && (
          <dl className="flex gap-8">
            {(
              [
                [plural(stats.shows, "Show"), stats.shows],
                [plural(stats.venues, "Theatre"), stats.venues],
                [plural(stats.cities, "City", "Cities"), stats.cities],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex flex-col-reverse">
                <dt className="text-footnote text-label-secondary">{label}</dt>
                <dd className="text-title-2 font-display text-label tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {children}
      </div>
    </section>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar } from "@/components/profile/Avatar";
import { RemoveFollowerButton } from "@/components/profile/RemoveFollowerButton";
import { BackLink } from "@/components/ui/BackLink";
import { listFollows, viewerContext } from "@/lib/follows";
import { HANDLE_PATTERN } from "@/lib/profile-handle";

// /@handle/followers and /@handle/following. Read with the visitor's session
// (anon when signed out), so RLS decides: a private profile's lists show only
// to its owner and approved followers. The owner can remove followers here.
export async function FollowList({ rawHandle, list }: { rawHandle: string; list: "followers" | "following" }) {
  const handle = rawHandle.toLowerCase();
  if (!HANDLE_PATTERN.test(handle)) notFound();
  const { supabase, userId } = await viewerContext();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, handle")
    .eq("handle", handle)
    .maybeSingle<{ id: string; handle: string }>();
  if (!profile) notFound();

  const { data: visible } = await supabase.rpc("profile_is_visible", { profile_id: profile.id });
  const people = visible ? await listFollows(supabase, profile.id, list) : [];
  const isOwner = userId === profile.id;
  const title = list === "followers" ? "Followers" : "Following";

  return (
    <section aria-labelledby="list-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <BackLink href={`/@${profile.handle}`}>@{profile.handle}</BackLink>
        <h1 id="list-heading" className="text-title font-display text-label">
          {title}
        </h1>
      </div>
      {!visible ? (
        <Empty title="This profile is private">Only @{profile.handle}’s approved followers see their followers and who they follow.</Empty>
      ) : people.length === 0 ? (
        <Empty title={list === "followers" ? "No followers yet" : "Not following anyone yet"}>
          {list === "followers"
            ? `When someone follows @${profile.handle}, they’ll appear here.`
            : `When @${profile.handle} follows someone, they’ll appear here.`}
        </Empty>
      ) : (
        <ul className="overflow-hidden rounded-md border border-separator bg-surface shadow-sm">
          {people.map((p) => {
            const name = p.display_name || `@${p.handle}`;
            return (
              <li key={p.id} className="flex items-center gap-3 border-b border-separator pr-3 last:border-b-0">
                <Link
                  href={`/@${p.handle}`}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2 hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                >
                  <Avatar name={name} url={p.avatar_url} size={40} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-headline text-label">@{p.handle}</span>
                    {p.display_name && (
                      <span className="truncate text-subheadline text-label-secondary">{p.display_name}</span>
                    )}
                  </span>
                </Link>
                {isOwner && list === "followers" && (
                  <RemoveFollowerButton followerId={p.id} followerHandle={p.handle} ownerId={profile.id} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-separator bg-surface px-6 py-12 text-center shadow-sm">
      <h2 className="text-headline text-label">{title}</h2>
      <p className="max-w-[320px] text-subheadline text-label-secondary">{children}</p>
    </div>
  );
}

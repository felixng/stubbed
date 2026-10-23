import type { Metadata } from "next";
import { Suspense } from "react";

import { FollowList } from "@/components/profile/FollowList";

// Served at /@handle/followers (rewritten here in next.config.ts).
export async function generateMetadata({ params }: PageProps<"/u/[handle]/followers">): Promise<Metadata> {
  const { handle } = await params;
  return { title: `Followers · @${handle.toLowerCase()} — Stubbed`, robots: { index: false } };
}

async function List({ params }: PageProps<"/u/[handle]/followers">) {
  const { handle } = await params;
  return <FollowList rawHandle={handle} list="followers" />;
}

export default function FollowersPage(props: PageProps<"/u/[handle]/followers">) {
  return (
    <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
      <List {...props} />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";

import { FollowList } from "@/components/profile/FollowList";

// Served at /@handle/following (rewritten here in next.config.ts).
export async function generateMetadata({ params }: PageProps<"/u/[handle]/following">): Promise<Metadata> {
  const { handle } = await params;
  return { title: `Following · @${handle.toLowerCase()} — Stubbed`, robots: { index: false } };
}

async function List({ params }: PageProps<"/u/[handle]/following">) {
  const { handle } = await params;
  return <FollowList rawHandle={handle} list="following" />;
}

export default function FollowingPage(props: PageProps<"/u/[handle]/following">) {
  return (
    <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
      <List {...props} />
    </Suspense>
  );
}

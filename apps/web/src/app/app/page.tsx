import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/app/EmptyState";
import { FeedCard } from "@/components/app/FeedCard";
import { FeedMore } from "@/components/app/FeedMore";
import { getFeed } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Home" };

async function Feed() {
  const { items, next, following, failed } = await getFeed();
  if (failed) {
    return <EmptyState title="Couldn’t load your feed">Check your connection and open Home again.</EmptyState>;
  }

  return (
    <>
      {items.length === 0 ? (
        <EmptyState title="Nothing here yet">
          <Link href="/app/log" className="font-semibold text-tint-text underline-offset-2 hover:underline">
            Track a show
          </Link>{" "}
          and it appears here, along with shows from people you follow.
          {following === 0 && " Search for people you go to the theatre with in the box above."}
        </EmptyState>
      ) : (
        <>
          {items.map((item) => (
            <FeedCard key={item.entry.id} item={item} />
          ))}
          {/* Older pages load in the browser. Keyed on the top show, so
              logging a new one starts them over. */}
          {next && <FeedMore key={items[0].entry.id} start={next} />}
        </>
      )}
    </>
  );
}

// Home: the feed. Your shows and the shows of people you follow, newest
// first, a page at a time. Your diary lives on the Profile tab. People to
// follow are found with the search box in the header.
export default function HomePage() {
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-title font-display text-label">Home</h1>
      <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
        <Feed />
      </Suspense>
    </section>
  );
}

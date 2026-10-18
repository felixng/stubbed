import { PublicEntryCard } from "@/components/profile/PublicEntryCard";
import type { FeedItem } from "@/lib/supabase/data";

// One show in the home feed. Your own shows open in the app (and say when
// they're private); others' open their page, which opens for approved
// followers of a private profile too. A private profile's trip pages don't,
// so its trips don't link. Public shows end with Like and Comment. Your own
// shows also get Edit (top right) and Share, which opens the share screen.
export function FeedCard({ item }: { item: FeedItem }) {
  const { entry, owner, mine, photoUrl, social } = item;
  return (
    <PublicEntryCard
      entry={entry}
      photoUrl={photoUrl ?? undefined}
      handle={owner.handle!}
      name={owner.display_name || `@${owner.handle}`}
      avatarUrl={owner.avatar_url}
      href={mine ? `/app/entries/${entry.id}` : `/e/${entry.id}`}
      tripHref={(id) => (mine ? `/app/trips/${id}` : owner.is_private ? null : `/t/${id}`)}
      badge={mine && entry.visibility === "private" ? "Private" : undefined}
      editHref={mine ? `/app/entries/${entry.id}/edit` : undefined}
      shareHref={mine ? `/app/entries/${entry.id}` : undefined}
      social={social ?? undefined}
    />
  );
}

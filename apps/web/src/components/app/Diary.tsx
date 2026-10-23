import Link from "next/link";

import { DiaryEntries } from "@/components/app/DiaryEntries";
import { EmptyState } from "@/components/app/EmptyState";
import { EntryList } from "@/components/app/EntryList";
import { UpcomingSection } from "@/components/app/UpcomingSection";
import { ProfileCalendar } from "@/components/profile/ProfileCalendar";
import { listOwnEntries, listOwnTrips } from "@/lib/supabase/data";

// The owner's diary (#14), on the Profile tab: upcoming shows, soonest first,
// then the calendar of shows seen (as on /@handle, but private ones too), then
// everything seen, newest first. Calendar days jump to their row below.
export async function Diary() {
  const [{ entries, photos }, trips] = await Promise.all([listOwnEntries(), listOwnTrips()]);
  // Shows you're going to, soonest first; then the ones you've seen, newest first.
  const upcoming = entries.filter((e) => e.status === "planned").reverse();
  const seen = entries.filter((e) => e.status === "logged");

  if (!entries.length) {
    return (
      <EmptyState title="No shows yet">
        <Link href="/app/log" className="font-semibold text-tint-text underline-offset-2 hover:underline">
          Log your first show
        </Link>
        . Start with a photo from the show and we’ll fill in what we can. Going to one soon? Log it with its date.
      </EmptyState>
    );
  }
  return (
    <>
      {upcoming.length > 0 && (
        <UpcomingSection count={upcoming.length}>
          <EntryList entries={upcoming} photos={photos} />
        </UpcomingSection>
      )}
      {seen.length > 0 && <ProfileCalendar entries={seen.map((e) => ({ id: e.id, date: e.date, title: e.show.title }))} />}
      {seen.length ? (
        <DiaryEntries entries={seen} photos={Object.fromEntries(photos)} trips={trips} />
      ) : (
        <EmptyState title="Nothing seen yet">Your shows appear here once you’ve been.</EmptyState>
      )}
    </>
  );
}

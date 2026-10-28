import { DiaryEntries } from "@/components/app/DiaryEntries";
import { EntryList } from "@/components/app/EntryList";
import { ImportCallout } from "@/components/app/ImportCallout";
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

  return (
    <>
      {/* Nothing logged yet: import comes first, any planned shows below. */}
      {!seen.length && <ImportCallout />}
      {upcoming.length > 0 && (
        <UpcomingSection count={upcoming.length}>
          <EntryList entries={upcoming} photos={photos} />
        </UpcomingSection>
      )}
      {seen.length > 0 && <ProfileCalendar entries={seen.map((e) => ({ id: e.id, date: e.date, title: e.show.title }))} />}
      {seen.length > 0 && <DiaryEntries entries={seen} photos={Object.fromEntries(photos)} trips={trips} />}
    </>
  );
}

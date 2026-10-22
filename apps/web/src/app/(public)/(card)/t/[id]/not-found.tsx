import { PublicNotFound } from "@/components/profile/PublicNotFound";

// No such trip, or none of its shows is public (or the profile is private).
export default function TripNotFound() {
  return <PublicNotFound title="This trip isn’t public" body="Its shows may have been made private or deleted." />;
}

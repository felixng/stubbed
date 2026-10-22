import { PublicNotFound } from "@/components/profile/PublicNotFound";

// No such entry, or it's private, planned or on a private profile: all look
// the same from outside.
export default function EntryNotFound() {
  return <PublicNotFound title="This show isn’t public" body="It may have been made private or deleted." />;
}

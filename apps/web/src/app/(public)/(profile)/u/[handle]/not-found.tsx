import { PublicNotFound } from "@/components/profile/PublicNotFound";

// An unknown handle.
export default function ProfileNotFound() {
  return <PublicNotFound title="No one here" body="This handle doesn’t have a public profile." />;
}

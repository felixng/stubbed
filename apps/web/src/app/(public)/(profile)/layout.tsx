import { SignedOutJoinCard } from "@/components/profile/JoinCard";

// Profiles and their follower lists: the waitlist card first, for
// signed-out visitors arriving from an Instagram bio.
export default function ProfileGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedOutJoinCard />
      {children}
    </>
  );
}

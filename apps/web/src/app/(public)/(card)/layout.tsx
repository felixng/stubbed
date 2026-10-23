import { SignedOutJoinCard } from "@/components/profile/JoinCard";

// Entry and trip pages, where a shared card leads: the card and the show or
// trip come first, then the waitlist card for signed-out visitors.
export default function CardGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SignedOutJoinCard />
    </>
  );
}

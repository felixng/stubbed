import Link from "next/link";

import { SignedOutJoinButton } from "@/components/profile/JoinCard";
import { Wordmark } from "@/components/ui/Wordmark";

// Shell for the public pages: profiles (/@handle), entries (/e/[id]) and
// trips (/t/[id]), and their not-found pages.
// Always light, like the landing page (data-theme switches the whole
// document). Visitors here are mostly logged out and arrive from a shared
// card or an Instagram bio, so the header button and the join card both lead
// to the waitlist (signed-out visitors only); sign-ups are still off. The
// join card comes from the group layouts: first on profiles ((profile)),
// after the shared card on entry and trip pages ((card)).
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-separator bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1040px] items-center justify-between px-4 sm:px-8">
          <Link href="/" className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            <Wordmark size={26} />
          </Link>
          <SignedOutJoinButton />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col gap-5 px-4 py-5 sm:px-8">{children}</main>
    </div>
  );
}

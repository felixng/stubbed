import Link from "next/link";

// The join card's anchor on the public pages (`JoinCard`). The card renders
// for signed-out visitors only, the same people who see these prompts.
export const JOIN_ANCHOR = "#join";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// What a signed-out visitor sees in place of the comment box. Sign-ups are
// off, so the way in is the waitlist; members who are signed out get a quiet
// sign-in link. `pill` under an entry's comments, `link` in a feed card.
export function JoinPrompt({ loginHref, variant }: { loginHref: string; variant: "pill" | "link" }) {
  return (
    <div className="flex flex-col items-start">
      <Link
        href={JOIN_ANCHOR}
        className={
          variant === "pill"
            ? `inline-flex min-h-11 w-fit items-center rounded-pill bg-tint-fill px-4 text-subheadline font-semibold text-tint-text transition-colors hover:bg-fill ${FOCUS}`
            : `-my-1.5 inline-flex min-h-11 w-fit items-center rounded-sm text-subheadline font-semibold text-tint-text underline-offset-2 hover:underline ${FOCUS}`
        }
      >
        Join the waitlist to like and comment
      </Link>
      <p className="flex flex-wrap items-center gap-x-1 text-footnote text-label-secondary">
        Already have an account?
        <Link href={loginHref} className={`inline-flex min-h-11 items-center rounded-sm font-semibold text-tint-text underline-offset-2 hover:underline ${FOCUS}`}>
          Sign in
        </Link>
      </p>
    </div>
  );
}

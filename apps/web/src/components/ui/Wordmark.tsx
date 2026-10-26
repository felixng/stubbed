import Image from "next/image";
import Link from "next/link";

// The ticket mark's proportions (public/brand/stubbed-mark.svg, from brand/).
const MARK_RATIO = 770 / 627;

// The Stubbed wordmark; matches Wordmark in the iOS app: "stubbed" in
// lowercase, heavy, tight tracking, in `label`, never `tint` or `tint-text`.
// Screen readers hear "Stubbed". With `mark`, the ticket mark (A2) sits
// before it, a little taller than the letters: the logo lockup for headers
// and sign-in. With `href` it becomes a home link.
export function Wordmark({
  size = 28,
  className = "",
  href,
  mark: withMark = false,
}: {
  size?: number;
  className?: string;
  href?: string;
  mark?: boolean;
}) {
  const fontSize = Math.max(16, size);
  const markHeight = Math.round(fontSize * 1.05);
  const mark = (
    <span
      className={`inline-flex items-center gap-[0.28em] font-display leading-none font-extrabold tracking-[-0.045em] text-label ${className}`}
      style={{ fontSize }}
    >
      {withMark && (
        <Image
          src="/brand/stubbed-mark.svg"
          alt=""
          aria-hidden="true"
          width={Math.round(markHeight * MARK_RATIO)}
          height={markHeight}
          unoptimized
          className="flex-none"
        />
      )}
      <span aria-hidden="true">stubbed</span>
      <span className="sr-only">Stubbed</span>
    </span>
  );
  if (!href) return mark;
  return (
    <Link
      href={href}
      className="-mx-1 inline-flex min-h-11 items-center rounded-md px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {mark}
    </Link>
  );
}

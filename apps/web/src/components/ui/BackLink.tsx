import Link from "next/link";

// The way up from a page below a tab, like the back button in an iOS
// navigation bar: a chevron and the parent's name, in tint-text, above the
// page heading. The negative margin lines the chevron up with the heading
// while keeping a 44px target.
export function BackLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`${className} -ml-2 inline-flex min-h-11 w-fit max-w-full items-center gap-0.5 rounded-pill pr-3 pl-1 text-subheadline font-semibold text-tint-text hover:bg-tint-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
    >
      <svg
        viewBox="0 0 24 24"
        width={20}
        height={20}
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-none"
      >
        <path d="M14.5 5.5 8 12l6.5 6.5" />
      </svg>
      <span className="truncate">{children}</span>
    </Link>
  );
}

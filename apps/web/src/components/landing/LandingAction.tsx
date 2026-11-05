import Link from "next/link";

export function LandingAction({ children }: { children: React.ReactNode }) {
  return <Link href="/signup" className="inline-flex min-h-[50px] items-center justify-center rounded-pill bg-tint px-6 text-headline font-semibold text-on-tint shadow-btn transition-colors hover:bg-tint-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{children}</Link>;
}

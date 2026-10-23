"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { TAB_ICONS } from "@/components/ui/TabBar";

// Bottom tab bar for the owner app (#13): Home (the feed), a big centre Log
// button, and Profile (your diary and trips). Same look as the
// `TabBar` UI component, but with links.
export function Icon({ id, size = 24 }: { id: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {TAB_ICONS[id].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const tab =
  "flex min-h-[49px] flex-1 flex-col items-center gap-0.5 pt-1.5 pb-1 text-caption-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// Which section a path belongs to, shared with the desktop sidebar so both
// mark the same place. Trip pages and settings sit under Profile.
export function section(pathname: string) {
  return {
    home: pathname === "/app",
    log: pathname.startsWith("/app/log"),
    profile: ["/app/profile", "/app/trips", "/app/settings"].some((p) => pathname.startsWith(p)),
    import: pathname.startsWith("/app/import"),
  };
}

export function AppTabBar() {
  return <AppTabBarLinks pathname={usePathname()} />;
}

// Rendered with no active tab while the page prerenders (the path is only
// known per request), then with the real path.
export function AppTabBarLinks({ pathname }: { pathname: string }) {
  const { home, profile, log } = section(pathname);

  return (
    <nav
      aria-label="Main"
      className="flex items-end border-t border-separator bg-surface px-2 pb-[env(safe-area-inset-bottom)]"
    >
      <Link
        href="/app"
        aria-current={home ? "page" : undefined}
        className={`${tab} ${home ? "text-tint-text" : "text-label-secondary"}`}
      >
        <Icon id="home" />
        <span>Home</span>
      </Link>
      <div className="flex flex-1 justify-center">
        <Link
          href="/app/log"
          aria-current={log ? "page" : undefined}
          className="-mt-5 mb-1.5 inline-flex min-h-14 items-center gap-1.5 rounded-pill bg-tint px-5 text-headline text-on-tint shadow-btn hover:bg-tint-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <svg
            viewBox="0 0 24 24"
            width={22}
            height={22}
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Log
        </Link>
      </div>
      <Link
        href="/app/profile"
        aria-current={profile ? "page" : undefined}
        className={`${tab} ${profile ? "text-tint-text" : "text-label-secondary"}`}
      >
        <Icon id="profile" />
        <span>Profile</span>
      </Link>
    </nav>
  );
}

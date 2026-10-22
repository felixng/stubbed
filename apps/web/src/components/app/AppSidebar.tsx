"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, section } from "@/components/app/AppTabBar";

// The sidebar's links on desktop (md and up), where it replaces the bottom tab
// bar: the same Home, Log and Profile, then Import. Log is a plain item here,
// not the raised coral button, so the page's own primary action stays the
// only coral fill on screen.
const item =
  "flex min-h-11 items-center gap-3 rounded-pill px-3 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

function NavLink({ href, icon, label, on }: { href: string; icon: string; label: string; on: boolean }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`${item} ${on ? "bg-tint-fill font-semibold text-tint-text" : "text-label hover:bg-fill"}`}
    >
      <Icon id={icon} />
      {label}
    </Link>
  );
}

export function AppSidebarNav() {
  return <AppSidebarLinks pathname={usePathname()} />;
}

// Rendered with nothing selected while the page prerenders, like the tab bar.
export function AppSidebarLinks({ pathname }: { pathname: string }) {
  const on = section(pathname);
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      <NavLink href="/app" icon="home" label="Home" on={on.home} />
      <NavLink href="/app/log" icon="log" label="Log" on={on.log} />
      <NavLink href="/app/profile" icon="profile" label="Profile" on={on.profile} />
      <div className="my-2 border-t border-separator" />
      <NavLink href="/app/import" icon="import" label="Import shows" on={on.import} />
    </nav>
  );
}

import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import { signOut } from "@/app/login/actions";
import { AccountMenu } from "@/components/app/AccountMenu";
import { AppSidebarLinks, AppSidebarNav } from "@/components/app/AppSidebar";
import { AppTabBar, AppTabBarLinks } from "@/components/app/AppTabBar";
import { HeaderSearch } from "@/components/app/HeaderSearch";
import { Wordmark } from "@/components/ui/Wordmark";

// Owner-only app shell (#13), mobile first. The proxy sends signed-out visits
// to /login; data access is still guarded by RLS. The shell itself doesn't
// read the session, so it prerenders and opens instantly.
export const metadata: Metadata = {
  title: { default: "Stubbed", template: "%s — Stubbed" },
  robots: { index: false, follow: false },
};

// viewportFit lets the tab bar sit above the home indicator on iPhones.
// Always light for now (owner's call), like the landing page.
export const viewport: Viewport = { viewportFit: "cover", themeColor: "#fff9f6" };

// Phones get a header and a bottom tab bar. From md (768px) a sidebar on the
// left holds the wordmark, people search and navigation instead, and the page
// keeps its 640px column beside it: below md the sidebar would squeeze that
// column under 520px.
//
// `isolate` lets the admin watermark (AdminOnly) sit between the shell's
// background and the page content.
export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <div data-theme="light" className="isolate flex min-h-dvh flex-col bg-background md:flex-row">
      <header className="sticky top-0 z-20 border-b border-separator bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
        <div className="relative mx-auto flex h-16 w-full max-w-[640px] items-center gap-2 px-4 sm:gap-3">
          <Wordmark size={30} href="/app" />
          <HeaderSearch />
          <AccountMenu />
        </div>
      </header>
      <aside className="sticky top-0 z-20 hidden h-dvh w-64 flex-none flex-col gap-5 border-r border-separator py-5 pr-4 pl-[max(1rem,env(safe-area-inset-left))] md:flex">
        <Wordmark size={28} href="/app" className="px-2" />
        <HeaderSearch wide />
        <Suspense fallback={<AppSidebarLinks pathname="" />}>
          <AppSidebarNav />
        </Suspense>
        <form action={signOut} className="mt-auto">
          <button
            type="submit"
            className="flex min-h-11 w-full cursor-pointer items-center rounded-pill px-3 text-body text-destructive hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Sign out
          </button>
        </form>
      </aside>
      <main className="mx-auto w-full max-w-[640px] flex-1 px-4 py-5 md:py-8">{children}</main>
      <div className="sticky bottom-0 z-20 md:hidden">
        <div className="mx-auto max-w-[640px]">
          <Suspense fallback={<AppTabBarLinks pathname="" />}>
            <AppTabBar />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

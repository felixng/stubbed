import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import { AccountMenu } from "@/components/app/AccountMenu";
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

// `isolate` lets the admin watermark (AdminOnly) sit between the shell's
// background and the page content.
export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <div data-theme="light" className="isolate flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-separator bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="relative mx-auto flex h-16 w-full max-w-[640px] items-center gap-2 px-4 sm:gap-3">
          <Wordmark size={30} href="/app" />
          <HeaderSearch />
          <AccountMenu />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[640px] flex-1 px-4 py-5">{children}</main>
      <div className="sticky bottom-0 z-20">
        <div className="mx-auto max-w-[640px]">
          <Suspense fallback={<AppTabBarLinks pathname="" />}>
            <AppTabBar />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

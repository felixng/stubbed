"use client";
import { signOut } from "@/app/login/actions";
import { clearGalleryCheckout } from "@/lib/gallery-checkout-draft";
import { disableBrowserPush } from "@/lib/browser-push";
export function SignOutButton({ className }: { className: string }) {
  return <form action={async () => { await Promise.allSettled([disableBrowserPush(), clearGalleryCheckout()]); await signOut(); }}>
    <button type="submit" className={className}>Sign out</button>
  </form>;
}

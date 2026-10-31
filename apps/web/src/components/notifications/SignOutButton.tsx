"use client";
import { signOut } from "@/app/login/actions";
import { disableBrowserPush } from "@/lib/browser-push";
export function SignOutButton({ className }: { className: string }) {
  return <form action={async () => { await disableBrowserPush().catch(() => {}); await signOut(); }}>
    <button type="submit" className={className}>Sign out</button>
  </form>;
}

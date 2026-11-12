"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const inFrame = () => window.self !== window.top;

// Presentation embeds the site in a frame and manages draft mode itself, and
// Studio has its own toolbar, so the button only shows on a directly opened
// preview. It sits bottom-left so it never covers Studio's Publish button.
export function ExitPreview() {
  const framed = useSyncExternalStore(subscribe, inFrame, () => true);
  const pathname = usePathname();
  if (framed || pathname.startsWith("/dressingroom")) return null;
  return (
    <form action="/api/draft-mode/disable" method="post" className="fixed bottom-4 left-4 z-50 rounded-lg bg-label p-3 text-background">
      <button type="submit" className="cursor-pointer">Exit content preview</button>
    </form>
  );
}

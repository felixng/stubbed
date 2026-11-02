import { Wordmark } from "./Wordmark";

// Render immediately while server content streams; no CMS or client JS needed.
export function PageLoading() {
  return (
    <div
      role="status"
      aria-label="Loading page"
      className="flex min-h-[70svh] flex-1 flex-col items-center justify-center gap-6 px-6 py-12"
    >
      <div aria-hidden="true"><Wordmark size={32} mark /></div>
      <div className="flex items-center gap-3 text-subheadline text-label-secondary" aria-hidden="true">
        <span className="size-4 rounded-full border-2 border-separator border-t-tint motion-safe:animate-spin" />
        <span>Loading…</span>
      </div>
    </div>
  );
}

// A thin done / stuck bar. Marks are sized by share of the total; the numbers sit beside it in the caller.
export function CrawlBar({ done, stuck = 0, total, label }: { done: number; stuck?: number; total: number; label: string }) {
  const share = (value: number) => (total > 0 ? `${Math.min(100, (value / total) * 100)}%` : "0%");
  return (
    <div role="img" aria-label={label} className="flex h-2 w-full min-w-24 overflow-hidden rounded-pill bg-fill">
      <span className="h-full bg-tint" style={{ width: share(done) }} />
      <span className="h-full bg-destructive" style={{ width: share(stuck) }} />
    </div>
  );
}

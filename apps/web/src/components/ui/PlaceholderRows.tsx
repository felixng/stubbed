// A first load: grey rows the shape of a show row (2:3 poster, title, venue
// line), like the iOS app's PlaceholderRows, instead of a "Loading…" line.
// Static on purpose; no pulse. Screen readers hear "Loading".
export function PlaceholderRows({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" className="flex items-center gap-4 py-2">
          <div className="aspect-2/3 w-14 flex-none rounded-sm bg-fill" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-4 w-2/3 rounded-pill bg-fill" />
            <div className="h-3 w-1/2 rounded-pill bg-fill" />
          </div>
        </div>
      ))}
    </div>
  );
}

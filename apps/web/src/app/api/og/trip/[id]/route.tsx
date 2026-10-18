import { formatTripDates } from "@/lib/entries";
import { CORAL, Footer, Ground, ogImage, ogNotFound, photoData, SECONDARY, titleSize } from "@/lib/og";
import { getPublicTrip } from "@/lib/public-pages";

// GET → the link preview for /t/[id] (1200×630 PNG): the trip's name, dates
// and "N shows in D nights", up to four of its photos as a grid, and @handle.
// Only public trips render, counting public shows only; anything else is a
// 404. The page links here with `?v=<version>`.
export async function GET(_request: Request, { params }: RouteContext<"/api/og/trip/[id]">) {
  const { id } = await params;
  const found = await getPublicTrip(id);
  if (!found) return ogNotFound();
  const { trip, owner, entries, photos, stats } = found;
  const tiles = (
    await Promise.all(
      entries
        .flatMap((e) => (e.photo_path && photos.get(e.photo_path) ? [photos.get(e.photo_path)!] : []))
        .slice(0, 4)
        .map((url) => photoData(url)),
    )
  ).filter((p): p is string => Boolean(p));
  // 1 photo fills the column; 2 stack; 3–4 make a 2×2 grid.
  const grid = tiles.length >= 3;
  const tile = (n: number) => (grid ? 313 : n === 2 ? { w: 630, h: 313 } : 630);

  const headline = `${stats.shows} ${stats.shows === 1 ? "show" : "shows"}${stats.nights > 0 ? ` in ${stats.nights} ${stats.nights === 1 ? "night" : "nights"}` : ""}`;
  const place = stats.cities.length === 1 ? stats.cities[0] : stats.cities.length > 1 ? `${stats.cities.length} cities` : null;
  const details = [
    `${stats.venues} ${stats.venues === 1 ? "theatre" : "theatres"}`,
    stats.average != null ? `${stats.average.toFixed(1)} average rating` : null,
  ].filter(Boolean);

  return ogImage(
    <Ground>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, padding: tiles.length ? 56 : 80 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 28, color: SECONDARY }}>{[formatTripDates(trip), place].filter(Boolean).join(" · ")}</div>
          <div style={{ fontSize: titleSize(trip.name, tiles.length ? [68, 56, 44] : [92, 76, 60]), lineHeight: 1.05, letterSpacing: "-0.03em", maxHeight: 220, overflow: "hidden" }}>
            {trip.name}
          </div>
          <div style={{ fontSize: 40, color: CORAL, letterSpacing: "-0.02em" }}>{headline}</div>
          <div style={{ fontSize: 28, color: "rgba(255, 255, 255, 0.85)" }}>{details.join(" · ")}</div>
        </div>
        <Footer handle={owner.handle} />
      </div>
      {tiles.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", width: 630, height: 630, gap: 4, flexShrink: 0 }}>
          {tiles.map((src, i) => {
            const t = tile(tiles.length);
            const w = typeof t === "number" ? t : t.w;
            const h = typeof t === "number" ? t : t.h;
            // A 3-photo grid lets the third photo span the bottom row.
            const wide = grid && tiles.length === 3 && i === 2;
            return (
              // eslint-disable-next-line @next/next/no-img-element -- rendered by next/og, not the browser
              <img key={i} src={src} alt="" width={wide ? 630 : w} height={h} style={{ width: wide ? 630 : w, height: h, objectFit: "cover" }} />
            );
          })}
        </div>
      )}
    </Ground>,
  );
}

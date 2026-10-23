import { formatDate, WITH_WEEKDAY } from "@/lib/entries";
import { Footer, Ground, ogImage, ogNotFound, photoData, SECONDARY, Stars, titleSize } from "@/lib/og";
import { getPublicEntry } from "@/lib/public-pages";

// GET → the link preview for /e/[id] (1200×630 PNG): the photo on the left
// when there is one, then the show, where, when, the stars and @handle.
// Only public entries render; anything else is a 404. The page links here
// with `?v=<version>`, so an edit gets a fresh image.
export async function GET(_request: Request, { params }: RouteContext<"/api/og/entry/[id]">) {
  const { id } = await params;
  const found = await getPublicEntry(id);
  if (!found) return ogNotFound();
  const { entry, owner } = found;
  const photo = await photoData(found.photoUrl);
  const where = [entry.venue?.name, entry.venue?.city].filter(Boolean).join(", ");
  const pad = photo ? 56 : 80;

  return ogImage(
    <Ground>
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element -- rendered by next/og, not the browser
        <img src={photo} alt="" width={630} height={630} style={{ width: 630, height: 630, objectFit: "cover" }} />
      )}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, padding: pad }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 28, color: SECONDARY }}>
            {formatDate(entry.date, WITH_WEEKDAY)}
          </div>
          <div
            style={{
              fontSize: titleSize(entry.show.title, photo ? [68, 56, 44] : [92, 76, 60]),
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              maxHeight: photo ? 300 : 260,
              overflow: "hidden",
            }}
          >
            {entry.show.title}
          </div>
          {where && <div style={{ fontSize: 30, color: "rgba(255, 255, 255, 0.85)" }}>{where}</div>}
          {entry.rating != null && <Stars value={entry.rating} size={photo ? 40 : 48} />}
        </div>
        <Footer handle={owner.handle} />
      </div>
    </Ground>,
  );
}

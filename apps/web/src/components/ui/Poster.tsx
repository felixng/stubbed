import type { ShowType } from "@/lib/entries";
import { POSTER_KIND, posterDesign, type PosterGround } from "@/lib/poster";

const GROUND: Record<PosterGround, string> = {
  fill: "bg-fill",
  wash: "bg-tint-fill",
  glow: "bg-glow",
};

// A 2:3 poster at radius-sm. The show's photo when there is one; without it,
// "House Lights": the title in Velvet Ink on one of three warm wells, the
// show type in small caps and a short Clay rule, seeded from the title so the
// same show always looks the same (lib/poster). Below 80px wide it falls back
// to the monogram over the rule. Decorative: the title is always printed
// beside it. Shared by EntryList, ShowRow and ShowCard.
export function Poster({
  title,
  type,
  poster,
  className = "",
}: {
  title: string;
  type?: ShowType;
  poster?: string;
  className?: string;
}) {
  if (poster) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- posters come from anywhere
      <img
        src={poster}
        alt=""
        className={`aspect-2/3 rounded-sm bg-fill object-cover ${className}`}
      />
    );
  }
  const d = posterDesign(title);
  const top = d.position === "top";
  return (
    <div
      aria-hidden="true"
      className={`@container relative aspect-2/3 overflow-hidden rounded-sm font-display ${className}`}
    >
      <div
        className={`absolute inset-0 flex flex-col rounded-[inherit] p-[9cqi] text-label shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--outline)_22%,transparent)] ${GROUND[d.ground]} ${
          top ? "justify-start gap-[6cqi]" : "justify-between"
        } @max-[80px]:items-center @max-[80px]:justify-center @max-[80px]:gap-0 @max-[80px]:p-0`}
      >
        <span
          className={`font-sans text-[clamp(11px,7.5cqi,13px)] leading-[1.2] font-semibold tracking-[0.06em] text-label-secondary uppercase ${
            top ? "order-2 mt-auto" : ""
          } @max-[80px]:hidden`}
        >
          {type ? POSTER_KIND[type] : null}
        </span>
        <span className={`flex flex-col @max-[80px]:items-center`}>
          <span
            className={`mb-[4cqi] block h-[max(2px,1.4cqi)] w-[16cqi] rounded-[1px] bg-outline @max-[80px]:mb-[8cqi] @max-[80px]:h-0.5 @max-[80px]:w-[26cqi]`}
          />
          <span
            style={{ fontSize: `${d.size}cqi` }}
            className={`leading-[1.04] font-bold tracking-[-0.02em] text-balance wrap-break-word hyphens-manual @max-[80px]:hidden`}
          >
            {title}
          </span>
          <span className={`hidden text-[34cqi] leading-none font-bold tracking-[-0.02em] text-outline @max-[80px]:block`}>
            {d.monogram}
          </span>
        </span>
      </div>
    </div>
  );
}

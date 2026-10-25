import { Chip } from "@/components/ui/Chip";
import { Poster } from "@/components/ui/Poster";
import { RatingStars } from "@/components/ui/RatingStars";
import type { ShowType } from "@/lib/entries";

// A portrait card for shelves and carousels on web (iOS uses FLShowRow).
// 160px wide; poster 2:3 at radius-sm.
export function ShowCard({
  title,
  venue,
  date,
  rating,
  type,
  poster,
  className = "",
}: {
  title: string;
  type?: ShowType;
  venue?: string;
  date?: string;
  rating?: number;
  poster?: string;
  className?: string;
}) {
  const meta = [venue, date].filter(Boolean).join(" · ");
  return (
    <article className={`flex w-40 flex-col gap-3 ${className}`}>
      <Poster title={title} type={type} poster={poster} className="w-full" />
      <div className="flex flex-col items-start gap-1">
        <h3 className="text-headline text-label">{title}</h3>
        {meta && (
          <p className="w-full truncate text-subheadline text-label-secondary">
            {meta}
          </p>
        )}
        {rating ? <RatingStars value={rating} size={14} /> : <Chip>Want to see</Chip>}
      </div>
    </article>
  );
}

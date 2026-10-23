import { Chip } from "@/components/ui/Chip";
import { Poster } from "@/components/ui/Poster";
import { RatingStars } from "@/components/ui/RatingStars";

// A portrait card for shelves and carousels on web (iOS uses FLShowRow).
// 160px wide; poster 2:3 at radius-sm.
export function ShowCard({
  title,
  venue,
  date,
  rating,
  poster,
  className = "",
}: {
  title: string;
  venue?: string;
  date?: string;
  rating?: number;
  poster?: string;
  className?: string;
}) {
  const meta = [venue, date].filter(Boolean).join(" · ");
  return (
    <article className={`flex w-40 flex-col gap-3 ${className}`}>
      <Poster
        title={title}
        poster={poster}
        className="w-full"
        initialsClassName="text-large-title"
      />
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

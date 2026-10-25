import { Chip } from "@/components/ui/Chip";
import { Poster } from "@/components/ui/Poster";
import { RatingStars } from "@/components/ui/RatingStars";
import type { ShowType } from "@/lib/entries";

// A diary or search row: poster thumbnail, title, venue and date, rating;
// matches FLShowRow. The consumer provides a list on `surface` with
// `separator` hairlines between rows.
export function ShowRow({
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
    <div className={`flex items-center gap-4 py-2 ${className}`}>
      <Poster title={title} type={type} poster={poster} className="w-14 flex-none" />
      <div className="flex min-w-0 flex-col items-start gap-1">
        <p className="text-headline text-label">{title}</p>
        {meta && (
          <p className="w-full truncate text-subheadline text-label-secondary">
            {meta}
          </p>
        )}
        {rating ? <RatingStars value={rating} size={14} /> : <Chip>Want to see</Chip>}
      </div>
    </div>
  );
}

import Image from "next/image";

// The landing page's pictures of the app: real iPhone screenshots of a sample
// diary (@sillyelphaba, the owner's own theatre photos, venues without a
// city), taken by `apps/ios/scripts/dev marketing` and copied here with
// `apps/web/scripts/landing-shots.sh`. Each is 1206×2622, an iPhone 17 Pro.

export type Shot = "hero" | "log" | "share" | "history" | "plan";

const WIDTH = 1206;
const HEIGHT = 2622;

// A phone: a thin near-black bezel around the screenshot, with the screen's own
// rounded corners. `className` sets its width; the height follows.
export function Phone({
  shot,
  label,
  sizes,
  preload = false,
  className = "",
}: {
  shot: Shot;
  label: string;
  sizes: string;
  preload?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[16.9%/7.75%] bg-[#1c1c1e] p-[1.2%] shadow-lg ${className}`}
    >
      <Image
        src={`/landing/${shot}.jpg`}
        alt={label}
        width={WIDTH}
        height={HEIGHT}
        sizes={sizes}
        preload={preload}
        className="h-auto w-full rounded-[15.5%/7.1%] bg-background"
      />
    </div>
  );
}

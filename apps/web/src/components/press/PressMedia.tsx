import Image from "next/image";

type ImageAsset = {
  label: string;
  format: string;
  src: string | null;
  width: number;
  height: number;
};

// Drop approved files into public/press/, then set each src to its /press/ URL.
// A missing src renders an honest, non-interactive placeholder, never a broken
// image or download. Keep the original high-resolution file for the download.
const appIcon: ImageAsset = {
  label: "App icon",
  format: "High-resolution PNG",
  src: null,
  width: 1024,
  height: 1024,
};

const screenshotGroups = [
  { name: "Home/Log", slug: "home-log" },
  { name: "Share Cards", slug: "share-cards" },
  { name: "Trip View", slug: "trip-view" },
  { name: "Stats", slug: "stats" },
] as const;

// Each screenshot has its own drop-in slot. Supply the actual pixel dimensions
// when adding a src. Transparent assets should retain their alpha channel.
const screenshots: Record<string, ImageAsset[]> = Object.fromEntries(
  screenshotGroups.map(({ slug }) => [
    slug,
    [
      { label: "Horizontal", format: "Landscape image", src: null, width: 1920, height: 1080 },
      { label: "Vertical", format: "Portrait image", src: null, width: 1080, height: 1920 },
      { label: "Transparent", format: "Image with alpha", src: null, width: 1080, height: 1080 },
    ],
  ]),
);

// Replace null only when an approved demo/walkthrough file is available.
// For a YouTube embed, replace the video below with a titled iframe and use
// the verified embed URL. Do not load an empty iframe or guessed external URL.
const demoVideo: string | null = null;

function MediaSymbol({ video = false }: { video?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      {video ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d="m10 8 6 4-6 4V8Z" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m3 17 5-5 4 4 4-6 5 7" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

function ImageSlot({ asset, subject }: { asset: ImageAsset; subject: string }) {
  return (
    <figure className="min-w-0 overflow-hidden rounded-md border border-separator bg-surface">
      {asset.src ? (
        <a href={asset.src} download className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <Image src={asset.src} alt={`${subject} — ${asset.label}`} width={asset.width} height={asset.height} className="h-32 w-full bg-background object-contain sm:h-40" />
          <span className="block px-4 pt-3 text-footnote font-semibold text-tint-text">Download {asset.label.toLowerCase()}</span>
        </a>
      ) : (
        <div className="flex h-32 flex-col items-center justify-center gap-2 border-b border-dashed border-separator bg-background px-3 text-label-secondary sm:h-40">
          <MediaSymbol />
          <span className="text-footnote">Awaiting asset</span>
        </div>
      )}
      <figcaption className="px-4 py-3">
        <p className="text-subheadline font-semibold text-label">{asset.label}</p>
        <p className="mt-1 text-footnote text-label-secondary">{asset.format}</p>
      </figcaption>
    </figure>
  );
}

export function PressMedia() {
  return (
    <section id="media-assets" aria-labelledby="media-heading" className="scroll-mt-8 space-y-8">
      <div>
        <h2 id="media-heading" className="font-display text-title text-label">Media assets</h2>
        <p className="mt-3 max-w-2xl text-body leading-relaxed text-label-secondary">
          App artwork, screenshots and a walkthrough will be added here. The slots below are placeholders; no media files are available to download yet.
        </p>
      </div>

      <div>
        <h3 className="mb-4 font-display text-title-2 text-label">App icon</h3>
        <div className="max-w-xs">
          {/* Drop-in HTML equivalent once the file exists:
              <a href="/press/app-icon.png" download>
                <img src="/press/app-icon.png" alt="Stubbed app icon" width="1024" height="1024" />
                Download high-resolution PNG
              </a>
          */}
          <ImageSlot asset={appIcon} subject="Stubbed" />
        </div>
      </div>

      <div className="space-y-6">
        <h3 className="font-display text-title-2 text-label">Screenshots</h3>
        {screenshotGroups.map(({ name, slug }) => (
          <section key={slug} aria-labelledby={`media-${slug}`}>
            <h4 id={`media-${slug}`} className="mb-3 text-headline text-label">{name}</h4>
            {/* For each format, replace its src above with the approved file URL.
                Drop-in HTML equivalent (repeat for horizontal, vertical, transparent):
                <a href="/press/APPROVED-FILE.png" download>
                  <img src="/press/APPROVED-FILE.png" alt="Describe the actual Stubbed screen and format" />
                  Download screenshot
                </a>
                These example paths are comments, not available assets.
            */}
            <div className="grid gap-3 sm:grid-cols-3">
              {screenshots[slug].map((asset) => <ImageSlot key={asset.label} asset={asset} subject={name} />)}
            </div>
          </section>
        ))}
      </div>

      <div>
        <h3 className="mb-4 font-display text-title-2 text-label">Video</h3>
        <figure className="overflow-hidden rounded-md border border-separator bg-surface">
          {/* Drop-in video when the approved file exists:
              <video controls preload="metadata" aria-label="Stubbed app walkthrough">
                <source src="/press/walkthrough.mp4" type="video/mp4" />
                <track kind="captions" src="/press/walkthrough-en.vtt" srcLang="en" label="English" default />
              </video>
              Add captions for spoken content and a transcript alongside the video.
          */}
          {demoVideo ? (
            <video controls preload="metadata" aria-label="Stubbed app walkthrough" className="max-h-96 w-full">
              <source src={demoVideo} type="video/mp4" />
            </video>
          ) : (
            <div className="flex min-h-40 flex-col items-center justify-center gap-2 border-b border-dashed border-separator bg-background p-6 text-label-secondary">
              <MediaSymbol video />
              <span className="text-footnote">Awaiting video</span>
            </div>
          )}
          <figcaption className="p-4">
            <p className="text-subheadline font-semibold text-label">Demo / walkthrough</p>
            <p className="mt-1 text-footnote text-label-secondary">Video file or YouTube embed</p>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

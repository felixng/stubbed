import Image from "next/image";

// Files in public/press/ are built by apps/web/scripts/press-assets.sh from
// the real app: screenshots in public/landing/ (landing-shots.sh), the stats
// screenshot from `apps/ios/scripts/dev marketing`, and the iOS app icons.
// Rerun it after new screenshots; every file here is a download.

const SHOT = { width: 1206, height: 2622 };

// Section headings on /press: the "section headline" marketing size
// (docs/DESIGN.md), bold and large like the reference press kit. Marketing
// pages only; never use it in the web app (/app).
export const pressHeading = "font-display text-[clamp(32px,5vw,48px)] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance text-label";

// Raw screenshot, the same screen in a phone frame (transparent PNG), and the
// page's caption. Order matches the doc's groups: Home/Log, Share cards,
// Trip view, Stats.
const screens = [
  { name: "Home feed", raw: "/landing/hero.jpg", framed: "/press/hero-framed.png" },
  { name: "Logging a show", raw: "/landing/log.jpg", framed: "/press/log-framed.png" },
  { name: "Share cards", raw: "/landing/share.jpg", framed: "/press/share-framed.png" },
  { name: "Trip view", raw: "/landing/plan.jpg", framed: "/press/plan-framed.png" },
  { name: "Diary", raw: "/landing/history.jpg", framed: "/press/history-framed.png" },
  { name: "Stats", raw: "/press/stats.jpg", framed: "/press/stats-framed.png" },
];

const landscapes = [
  { name: "Home and logging", src: "/press/home-log-landscape.jpg" },
  { name: "Share cards", src: "/press/share-cards-landscape.jpg" },
  { name: "Trip view", src: "/press/trip-view-landscape.jpg" },
  { name: "Stats", src: "/press/stats-landscape.jpg" },
];

// The logo variants from public/brand/ (the design system page shows the same).
const marks = [
  { name: "Mark", use: "The logo without the wordmark. Transparent; only on light backgrounds.", svg: "/brand/stubbed-mark.svg", png: "/brand/stubbed-mark.png" },
  { name: "Outline mark", use: "A lighter version for large or decorative uses on white. Not for small sizes.", svg: "/brand/stubbed-mark-outline.svg", png: "/brand/stubbed-mark-outline.png" },
];

const icons = [
  { name: "Light", src: "/press/app-icon.png" },
  { name: "Dark", src: "/press/app-icon-dark.png" },
  { name: "Tinted", src: "/press/app-icon-tinted.png" },
];

const download = "inline-flex min-h-11 items-center gap-1.5 rounded-sm text-footnote font-semibold text-tint-text hover:text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

function Arrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2.5v8m-3.5-3.5L8 10.5 11.5 7M3 13.5h10" />
    </svg>
  );
}

function Download({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} download className={download}>
      <Arrow />
      {children}
    </a>
  );
}

export function PressScreenshots() {
  return (
    <section id="screenshots" aria-labelledby="screenshots-heading" className="scroll-mt-8">
      <h2 id="screenshots-heading" className={pressHeading}>Screenshots</h2>
      <p className="mt-3 max-w-2xl leading-relaxed text-label-secondary">From the iPhone app, at full resolution. Each comes as the original screenshot and in a phone frame on a transparent background.</p>
      <ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 sm:gap-x-8">
        {screens.map((screen) => (
          <li key={screen.name} className="min-w-0">
            <div className="rounded-[18%/8.3%] bg-[#1c1c1e] p-[2.6%] shadow-lg ring-1 ring-black/10">
              <Image src={screen.raw} alt={`Stubbed on iPhone: ${screen.name.toLowerCase()}`} width={SHOT.width} height={SHOT.height} sizes="(min-width: 640px) 300px, 45vw" className="h-auto w-full rounded-[15.5%/7.1%] bg-background" />
            </div>
            <p className="mt-4 text-headline text-label">{screen.name}</p>
            <div className="flex flex-wrap gap-x-4">
              <Download href={screen.framed}>Framed PNG</Download>
              <Download href={screen.raw}>Screenshot</Download>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PressMedia() {
  return (
    <section id="media-assets" aria-labelledby="media-heading" className="scroll-mt-8 space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <h2 id="media-heading" className={pressHeading}>Media assets</h2>
          <p className="mt-3 leading-relaxed text-label-secondary">Logos and app icons, landscape images for articles and videos, and a share card. Everything on this page is in one download.</p>
        </div>
        <a href="/press/stubbed-press-kit.zip" download className="inline-flex min-h-11 items-center gap-2 rounded-full bg-tint px-5 font-semibold text-on-tint hover:bg-tint-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <Arrow />
          Download everything (.zip)
        </a>
      </div>

      <div className="space-y-10">
        <h3 className="font-display text-title-2 text-label">Logo and app icon</h3>

        <div>
          <h4 className="text-headline text-label">Horizontal logo</h4>
          <p className="mt-1 text-subheadline text-label-secondary">The mark and the wordmark, for headers and articles. Transparent PNG; use the white version on dark backgrounds.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="flex aspect-[2/1] items-center justify-center rounded-xl bg-surface p-8 ring-1 ring-separator">
                <Image src="/press/stubbed-logo.png" alt="The Stubbed logo: the ticket mark and the stubbed wordmark" width={2141} height={500} sizes="(min-width: 640px) 400px, 80vw" className="h-auto w-full max-w-sm" />
              </div>
              <Download href="/press/stubbed-logo.png">PNG, for light backgrounds</Download>
            </div>
            <div>
              <div className="flex aspect-[2/1] items-center justify-center rounded-xl bg-[#1c1c1e] p-8">
                <Image src="/press/stubbed-logo-white.png" alt="The Stubbed logo with a white wordmark, on a dark background" width={2141} height={500} sizes="(min-width: 640px) 400px, 80vw" className="h-auto w-full max-w-sm" />
              </div>
              <Download href="/press/stubbed-logo-white.png">PNG, for dark backgrounds</Download>
            </div>
          </div>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          {marks.map((mark) => (
            <div key={mark.name}>
              <h4 className="text-headline text-label">{mark.name}</h4>
              <p className="mt-1 text-subheadline text-label-secondary">{mark.use}</p>
              <div className="mt-4 flex aspect-[2/1] items-center justify-center rounded-xl bg-surface p-8 ring-1 ring-separator">
                <Image src={mark.png} alt={`The Stubbed ${mark.name.toLowerCase()}: two admission tickets`} width={1024} height={834} sizes="200px" className="h-full w-auto" />
              </div>
              <div className="flex flex-wrap gap-x-4">
                <Download href={mark.svg}>SVG</Download>
                <Download href={mark.png}>PNG, 1024 px</Download>
              </div>
            </div>
          ))}
        </div>

        <div>
          <h4 className="text-headline text-label">App icon</h4>
          <p className="mt-1 text-subheadline text-label-secondary">For anywhere the logo sits on a photo or an unknown background. Don&apos;t add a border or shadow.</p>
          <ul className="mt-4 flex flex-wrap gap-8">
            {icons.map((icon) => (
              <li key={icon.name}>
                <Image src={icon.src} alt={`Stubbed app icon, ${icon.name.toLowerCase()} appearance`} width={1024} height={1024} sizes="128px" className="h-28 w-28 rounded-[22%] shadow-sm ring-1 ring-black/5 sm:h-32 sm:w-32" />
                <p className="mt-3 text-subheadline text-label">{icon.name}</p>
                <Download href={icon.src}>1024 px PNG</Download>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <h3 className="font-display text-title-2 text-label">Landscape images</h3>
        <p className="mt-2 text-subheadline text-label-secondary">1920 × 1080, for article headers, slides and video.</p>
        <ul className="mt-5 grid gap-x-6 gap-y-8 sm:grid-cols-2">
          {landscapes.map((image) => (
            <li key={image.name} className="min-w-0">
              <Image src={image.src} alt={`Stubbed: ${image.name.toLowerCase()}, landscape image`} width={1920} height={1080} sizes="(min-width: 640px) 480px, 100vw" className="h-auto w-full rounded-xl ring-1 ring-separator" />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4">
                <p className="text-subheadline text-label">{image.name}</p>
                <Download href={image.src}>JPG</Download>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="font-display text-title-2 text-label">Share card</h3>
        <p className="mt-2 text-subheadline text-label-secondary">What people post: a square card for each show, drawn by the app.</p>
        <div className="mt-5 max-w-xs">
          <Image src="/press/share-card.jpg" alt="A Stubbed share card for The Lost Boys at the Palace Theatre" width={1098} height={1098} sizes="320px" className="h-auto w-full rounded-xl" />
          <Download href="/press/share-card.jpg">JPG</Download>
        </div>
      </div>
      {/* Video: when a walkthrough exists, add it here as
          <video controls preload="metadata" src="/press/walkthrough.mp4"> with captions. */}
    </section>
  );
}

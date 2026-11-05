import type { Copy } from "@/lib/cms/model";
import { getCopy } from "@/lib/cms/content";
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
const screens = (copy: Copy<"pressScreenshots">) => [
  { name: copy.screens1Name, raw: "/landing/hero.jpg", framed: "/press/hero-framed.png" },
  { name: copy.screens2Name, raw: "/landing/log.jpg", framed: "/press/log-framed.png" },
  { name: copy.screens3Name, raw: "/landing/share.jpg", framed: "/press/share-framed.png" },
  { name: copy.screens4Name, raw: "/landing/plan.jpg", framed: "/press/plan-framed.png" },
  { name: copy.screens5Name, raw: "/landing/history.jpg", framed: "/press/history-framed.png" },
  { name: copy.screens6Name, raw: "/press/stats.jpg", framed: "/press/stats-framed.png" },
];

const landscapes = (copy: Copy<"pressMedia">) => [
  { name: copy.landscapes1Name, src: "/press/home-log-landscape.jpg" },
  { name: copy.landscapes2Name, src: "/press/share-cards-landscape.jpg" },
  { name: copy.landscapes3Name, src: "/press/trip-view-landscape.jpg" },
  { name: copy.landscapes4Name, src: "/press/stats-landscape.jpg" },
];

// The logo variants from public/brand/ (the design system page shows the same).
const marks = (copy: Copy<"pressMedia">) => [
  { name: copy.marks1Name, use: copy.marks1Use, svg: "/brand/stubbed-mark.svg", png: "/brand/stubbed-mark.png" },
  { name: copy.marks2Name, use: copy.marks2Use, svg: "/brand/stubbed-mark-outline.svg", png: "/brand/stubbed-mark-outline.png" },
];

const icons = (copy: Copy<"pressMedia">) => [
  { name: copy.icons1Name, src: "/press/app-icon.png" },
  { name: copy.icons2Name, src: "/press/app-icon-dark.png" },
  { name: copy.icons3Name, src: "/press/app-icon-tinted.png" },
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

export async function PressScreenshots() {
  const copy = await getCopy("pressScreenshots");
  return (
    <section id="screenshots" aria-labelledby="screenshots-heading" className="scroll-mt-8">
      <h2 id="screenshots-heading" className={pressHeading}>{copy.screenshots}</h2>
      <p className="mt-3 max-w-2xl leading-relaxed text-label-secondary">{copy.fromTheIPhoneAppAtFull}</p>
      <ul className="mt-8 grid grid-cols-2 gap-x-3 gap-y-10 sm:grid-cols-3">
        {screens(copy).map((screen) => (
          <li key={screen.name} className="min-w-0">
            <div className="rounded-[18%/8.3%] bg-[#1c1c1e] p-[2.6%] shadow-lg ring-1 ring-black/10">
              <Image src={screen.raw} alt={`Stubbed on iPhone: ${screen.name.toLowerCase()}`} width={SHOT.width} height={SHOT.height} sizes="(min-width: 640px) 232px, 45vw" className="h-auto w-full rounded-[15.5%/7.1%] bg-background" />
            </div>
            <p className="mt-4 text-headline text-label">{screen.name}</p>
            <div className="flex flex-wrap gap-x-4">
              <Download href={screen.framed}>{copy.framedPNG}</Download>
              <Download href={screen.raw}>{copy.screenshot}</Download>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export async function PressMedia() {
  const copy = await getCopy("pressMedia");
  return (
    <section id="media-assets" aria-labelledby="media-heading" className="scroll-mt-8 space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <h2 id="media-heading" className={pressHeading}>{copy.mediaAssets}</h2>
          <p className="mt-3 leading-relaxed text-label-secondary">{copy.logosAndAppIconsLandscapeImages}</p>
        </div>
        <a href="/press/stubbed-press-kit.zip" download className="inline-flex min-h-11 items-center gap-2 rounded-full bg-tint px-5 font-semibold text-on-tint hover:bg-tint-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <Arrow />
          {copy.downloadEverythingZip}</a>
      </div>

      <div className="space-y-10">
        <h3 className="font-display text-title-2 text-label">{copy.logoAndAppIcon}</h3>

        <div>
          <h4 className="text-headline text-label">{copy.horizontalLogo}</h4>
          <p className="mt-1 text-subheadline text-label-secondary">{copy.theMarkAndTheWordmarkFor}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="flex aspect-[2/1] items-center justify-center rounded-xl bg-surface p-8 ring-1 ring-separator">
                <Image src="/press/stubbed-logo.png" alt="The Stubbed logo: the ticket mark and the stubbed wordmark" width={2141} height={500} sizes="(min-width: 640px) 300px, 80vw" className="h-auto w-full max-w-sm" />
              </div>
              <Download href="/press/stubbed-logo.png">{copy.pngForLightBackgrounds}</Download>
            </div>
            <div>
              <div className="flex aspect-[2/1] items-center justify-center rounded-xl bg-[#1c1c1e] p-8">
                <Image src="/press/stubbed-logo-white.png" alt="The Stubbed logo with a white wordmark, on a dark background" width={2141} height={500} sizes="(min-width: 640px) 300px, 80vw" className="h-auto w-full max-w-sm" />
              </div>
              <Download href="/press/stubbed-logo-white.png">{copy.pngForDarkBackgrounds}</Download>
            </div>
          </div>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          {marks(copy).map((mark) => (
            <div key={mark.name}>
              <h4 className="text-headline text-label">{mark.name}</h4>
              <p className="mt-1 text-subheadline text-label-secondary">{mark.use}</p>
              <div className="mt-4 flex aspect-[2/1] items-center justify-center rounded-xl bg-surface p-8 ring-1 ring-separator">
                <Image src={mark.png} alt={`The Stubbed ${mark.name.toLowerCase()}: two admission tickets`} width={1024} height={834} sizes="200px" className="h-full w-auto" />
              </div>
              <div className="flex flex-wrap gap-x-4">
                <Download href={mark.svg}>{copy.svg}</Download>
                <Download href={mark.png}>{copy.png1024Px}</Download>
              </div>
            </div>
          ))}
        </div>

        <div>
          <h4 className="text-headline text-label">{copy.appIcon}</h4>
          <p className="mt-1 text-subheadline text-label-secondary">{copy.forAnywhereTheLogoSitsOn}</p>
          <ul className="mt-4 flex flex-wrap gap-8">
            {icons(copy).map((icon) => (
              <li key={icon.name}>
                <Image src={icon.src} alt={`Stubbed app icon, ${icon.name.toLowerCase()} appearance`} width={1024} height={1024} sizes="128px" className="h-28 w-28 rounded-[22%] shadow-sm ring-1 ring-black/5 sm:h-32 sm:w-32" />
                <p className="mt-3 text-subheadline text-label">{icon.name}</p>
                <Download href={icon.src}>{copy.text1024PxPNG}</Download>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <h3 className="font-display text-title-2 text-label">{copy.landscapeImages}</h3>
        <p className="mt-2 text-subheadline text-label-secondary">{copy.text19201080ForArticleHeadersSlides}</p>
        <ul className="mt-5 grid gap-x-6 gap-y-8 sm:grid-cols-2">
          {landscapes(copy).map((image) => (
            <li key={image.name} className="min-w-0">
              <Image src={image.src} alt={`Stubbed: ${image.name.toLowerCase()}, landscape image`} width={1920} height={1080} sizes="(min-width: 640px) 354px, 100vw" className="h-auto w-full rounded-xl ring-1 ring-separator" />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4">
                <p className="text-subheadline text-label">{image.name}</p>
                <Download href={image.src}>{copy.jpg}</Download>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="font-display text-title-2 text-label">{copy.shareCard}</h3>
        <p className="mt-2 text-subheadline text-label-secondary">{copy.whatPeoplePostASquareCard}</p>
        <div className="mt-5 max-w-xs">
          <Image src="/press/share-card.jpg" alt="A Stubbed share card for The Lost Boys at the Palace Theatre" width={1098} height={1098} sizes="320px" className="h-auto w-full rounded-xl" />
          <Download href="/press/share-card.jpg">{copy.jpg2}</Download>
        </div>
      </div>
      {/* Video: when a walkthrough exists, add it here as
          <video controls preload="metadata" src="/press/walkthrough.mp4"> with captions. */}
    </section>
  );
}

import { getCopy, getSiteCopy } from "@/lib/cms/content";
import type { Metadata, Viewport } from "next";
import Image from "next/image";

import { Container } from "@/components/landing/Container";
import { Footer } from "@/components/landing/Footer";
import { SiteMenu } from "@/components/landing/SiteMenu";
import { PressMedia, PressScreenshots, pressHeading } from "@/components/press/PressMedia";
import { Wordmark } from "@/components/ui/Wordmark";

export async function generateMetadata(): Promise<Metadata> {
  const copy = await getCopy("pressMeta");
  return { title: copy.seoTitle, description: copy.description,
    alternates: { canonical: "/press" },
    openGraph: { title: copy.seoTitle, description: copy.description, url: "/press" },
  };
}
export const viewport: Viewport = { themeColor: "#fff9f6" };

// Laid out like getpersonalbest.com/press (the owner's reference): one
// 720px column for everything, screenshots and media included.

// Press enquiries go to Felix directly (owner, 2026-11-01); the legal pages keep support@.

const link = "rounded-sm text-tint-text underline underline-offset-4 hover:text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export default async function PressPage() {
  const pageCopy = await getCopy("pressMeta");
  const copy = await getCopy("press");
  const site = await getSiteCopy();
  const PRESS_EMAIL = site.pressEmail;
  const features = [
  [copy.feature1Title, copy.feature1Description, "M4 4h16v16H4zM8 4v16M4 9h16"],
  [copy.feature2Title, copy.feature2Description, "M12 16V3m-4 4 4-4 4 4M5 12v8h14v-8"],
  [copy.feature3Title, copy.feature3Description, "M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"],
  [copy.feature4Title, copy.feature4Description, "M5 20v-7m7 7V4m7 16V9"],
  [copy.feature5Title, copy.feature5Description, "M4 5h16v15H4zM8 3v4m8-4v4M4 10h16"],
];
  return (
    <div data-theme="light" className="flex flex-1 flex-col bg-background">
      <a href="#press-content" className="sr-only rounded-sm bg-surface p-3 focus:not-sr-only focus:absolute focus:z-20 focus:outline-2 focus:outline-focus">{copy.skipToContent}</a>
      <header>
        <Container className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-6 sm:py-8">
          <Wordmark size={28} href="/" mark />
          <SiteMenu />
        </Container>
      </header>
      <main id="press-content">
        <Container className="pb-16 sm:pb-24">
          <div className="mx-auto max-w-[720px] space-y-14 pt-6 sm:space-y-16 sm:pt-10">
            <div>
              <Image src="/press/app-icon.png" alt={copy.theStubbedAppIcon} width={1024} height={1024} sizes="88px" preload className="mb-8 h-20 w-20 rounded-[22%] shadow-sm ring-1 ring-black/5 sm:h-[88px] sm:w-[88px]" />
              <h1 className="font-display text-[clamp(44px,7vw,76px)] leading-[1.02] font-extrabold tracking-[-0.03em] text-balance text-label">{pageCopy.title}</h1>
              <p className="mt-5 text-lg leading-relaxed text-label-secondary">{copy.youreEncouragedToUseAnythingYou}</p>

              <section aria-labelledby="try-it" className="mt-10 rounded-2xl bg-surface p-6 ring-1 ring-separator sm:p-8">
                <h2 id="try-it" className="font-display text-title font-extrabold text-label">{copy.tryItOut}</h2>
                <p className="mt-3 leading-relaxed text-label-secondary">{copy.stubbedIsFreeOnTheWeb}</p>
                {/* TODO(#236): when a public TestFlight link exists, add it here as a second button. */}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <a href="/signup" className="inline-flex min-h-11 items-center rounded-full bg-tint px-5 font-semibold text-on-tint hover:bg-tint-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{copy.signUpFree}</a>
                  <a href={`mailto:${PRESS_EMAIL}?subject=TestFlight%20invite`} className="inline-flex min-h-11 items-center rounded-full px-5 font-semibold text-label ring-1 ring-separator hover:ring-outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{copy.askForATestFlightInvite}</a>
                </div>
              </section>
            </div>

            <section aria-labelledby="press-links">
              <h2 id="press-links" className={pressHeading}>{copy.links}</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 marker:text-label-secondary">
                <li><a href="https://getstubbed.app/" className={link}>{copy.stubbedOnTheWeb}</a></li>
                <li><a href={`mailto:${PRESS_EMAIL}`} className={link}>{PRESS_EMAIL}</a></li>
                <li><a href={site.instagramUrl} className={link}>{copy.felixOnInstagram}</a></li>
                {/* TODO(#247): replace with the live App Store link at launch. */}
                <li className="text-label-secondary">{copy.stubbedOnTheAppStoreComing}</li>
              </ul>
            </section>

            <section aria-labelledby="what-is-stubbed">
              <h2 id="what-is-stubbed" className={pressHeading}>{copy.whatIsStubbed}</h2>
              <p className="mt-4 leading-relaxed">{copy.stubbedIsATheatreDiaryApp}</p>
              <ul className="mt-8 space-y-6">
                {features.map(([title, description, path]) => (
                  <li key={title}>
                    <h3 className="flex items-center gap-2.5 font-display text-[20px] leading-7 font-bold text-label">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-tint-text"><path d={path} /></svg>
                      {title}
                    </h3>
                    <p className="mt-1.5 leading-relaxed text-label-secondary">{description}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="the-story">
              <h2 id="the-story" className={pressHeading}>{copy.whatsTheStoryBehindIt}</h2>
              <p className="mt-4 leading-relaxed">{copy.imFelixNgAnIndieDeveloper}</p>
            </section>

            <section aria-labelledby="enquiries">
              <h2 id="enquiries" className={pressHeading}>{copy.questionsAndEnquiries}</h2>
              <p className="mt-4 leading-relaxed">{copy.imAvailableToAnyJournalistsBloggers}<a href={`mailto:${PRESS_EMAIL}`} className={link}>{copy.email}</a> {copy.toScheduleSomething}</p>
            </section>
          </div>

          <div className="mx-auto mt-16 max-w-[720px] space-y-16 sm:mt-20 sm:space-y-20">
            <PressScreenshots />
            <PressMedia />
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
}

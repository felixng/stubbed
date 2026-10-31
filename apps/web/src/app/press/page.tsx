import type { Metadata, Viewport } from "next";

import { Container } from "@/components/landing/Container";
import { Footer } from "@/components/landing/Footer";
import { SiteMenu } from "@/components/landing/SiteMenu";
import { PressMedia } from "@/components/press/PressMedia";
import { Wordmark } from "@/components/ui/Wordmark";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Stubbed Press Kit",
  description: "About Stubbed, its story, press enquiries and media assets for coverage of the theatre diary app.",
  alternates: { canonical: "/press" },
  openGraph: { title: "Stubbed Press Kit", description: "The theatre diary app: its story, press enquiries and media assets.", url: "/press" },
};
export const viewport: Viewport = { themeColor: "#f2f2f7" };

const features = [
  ["Track your visits", "Every show you see, in one place: the venue, the date, your half-star rating, and your thoughts about the show.", "M4 4h16v16H4zM8 4v16M4 9h16"],
  ["Share with your friends", "Generate beautiful Instagram share cards of your theatre trips to share with your network.", "M12 16V3m-4 4 4-4 4 4M5 12v8h14v-8"],
  ["See your history", "Bring old nights in from ticket emails and photos to build your definitive theatre log.", "M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"],
  ["Trips and stats", "Group your shows into specific trips and see stats across your theatre life.", "M5 20v-7m7 7V4m7 16V9"],
  ["Plan ahead", "Keep track of upcoming shows you're excited to see.", "M4 5h16v15H4zM8 3v4m8-4v4M4 10h16"],
];
const linkClass = "inline-flex min-h-11 items-center break-all rounded-sm text-tint-text underline underline-offset-4 hover:text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export default function PressPage() {
  return (
    <div data-theme="light" className="flex flex-1 flex-col bg-background">
      <a href="#press-content" className="sr-only rounded-sm bg-surface p-3 focus:not-sr-only focus:absolute focus:z-20 focus:outline-2 focus:outline-focus">Skip to content</a>
      <header>
        <Container className="flex items-center justify-between gap-4 py-6 sm:py-8">
          <Wordmark size={28} href="/" mark />
          <SiteMenu />
        </Container>
      </header>
      <main id="press-content">
        <Container className="pb-16 sm:pb-24">
          <div className="mx-auto max-w-5xl">
            <div className="border-b border-separator pt-8 pb-10 sm:pt-12 sm:pb-14">
              <p className="mb-4 text-footnote font-semibold uppercase tracking-widest text-label-secondary">For the press</p>
              <h1 className="font-display text-4xl font-bold tracking-tight text-label sm:text-6xl">Stubbed Press Kit</h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-label-secondary">You&apos;re encouraged to use anything you find here in stories, reviews, blogs, videos, or any coverage about Stubbed.</p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                {/* TODO: Replace this labelled status with <a href="OWNER_SUPPLIED_BETA_URL">Try it out</a> once a TestFlight/private beta invite is supplied. */}
                <div className="rounded-md border border-separator bg-surface px-5 py-3">
                  <p className="text-headline">Try it out</p>
                  <p className="mt-1 text-footnote text-label-secondary">TestFlight / private beta invite pending</p>
                </div>
                <a href="#media-assets" className={linkClass}>Browse media assets <span aria-hidden="true" className="ml-2">↓</span></a>
              </div>
            </div>

            <div className="grid gap-10 py-10 sm:py-14 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
              <aside aria-labelledby="press-links">
                <h2 id="press-links" className="font-display text-title-2">Links</h2>
                <dl className="mt-4 space-y-4 text-subheadline">
                  <div><dt className="text-label-secondary">Website</dt><dd><a href="https://getstubbed.app/" className={linkClass}>getstubbed.app</a></dd></div>
                  <div><dt className="text-label-secondary">Contact</dt><dd><a href={`mailto:${LEGAL.email}`} className={linkClass}>{LEGAL.email}</a></dd></div>
                  {/* TODO: <a href="OWNER_SUPPLIED_APP_STORE_URL">Stubbed on the App Store</a> */}
                  <div><dt className="text-label-secondary">App Store</dt><dd className="mt-1">Not published yet</dd></div>
                  <div><dt className="text-label-secondary">Creator</dt><dd><a href="https://www.instagram.com/hellofelix__/" className={linkClass}>Felix on Instagram</a></dd></div>
                </dl>
              </aside>
              <div className="min-w-0 space-y-12">
                <section aria-labelledby="what-is-stubbed">
                  <h2 id="what-is-stubbed" className="font-display text-title">What is Stubbed?</h2>
                  <p className="mt-4 leading-relaxed">Stubbed is a theatre diary app to track, rate, and share the shows you&apos;ve seen. It&apos;s designed specifically for theatre-goers to log their plays, musicals, and operas, rate them, and share their experiences with the people who get it.</p>
                  <ul className="mt-8 space-y-6">
                    {features.map(([title, description, path]) => (
                      <li key={title} className="flex gap-4">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0 text-label-secondary"><path d={path} /></svg>
                        <div><h3 className="text-headline">{title}</h3><p className="mt-1 leading-relaxed text-label-secondary">{description}</p></div>
                      </li>
                    ))}
                  </ul>
                </section>
                <section aria-labelledby="the-story">
                  <h2 id="the-story" className="font-display text-title">What&apos;s the story behind it?</h2>
                  <p className="mt-4 leading-relaxed">I&apos;m Felix Ng, an indie developer and engineering manager based in London. Theatre is a massive part of my life—in 2022, I served as an Olivier Awards panellist and saw over 100 stage productions in a single year. I wanted a dedicated, beautifully designed place to log my theatre visits, track my stats, and share my thoughts with fellow theatre lovers without relying on generic note apps or spreadsheets. So, I built Stubbed. It’s a labour of love for the theatre community, built independently in London.</p>
                </section>
                <section aria-labelledby="enquiries">
                  <h2 id="enquiries" className="font-display text-title">Questions and enquiries</h2>
                  <p className="mt-4 leading-relaxed">I&apos;m available to any journalists, bloggers, podcasters, or theatre creators wishing to discuss Stubbed, London theatre, or indie iOS app development. Get in touch via <a href={`mailto:${LEGAL.email}`} className="rounded-sm text-tint-text underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">email</a> to schedule something.</p>
                </section>
              </div>
            </div>
            <PressMedia />
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
}

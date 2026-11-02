import Link from "next/link";

import { Container } from "@/components/landing/Container";
import { Footer } from "@/components/landing/Footer";
import { Wordmark } from "@/components/ui/Wordmark";
import { LEGAL } from "@/lib/legal";

// Shared shell for /terms and /privacy: the landing header and footer around
// a readable column of text. Always light, like the landing page.
export function LegalPage({
  title,
  updated = LEGAL.updated,
  intro,
  children,
}: {
  title: string;
  updated?: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div data-theme="light" className="flex flex-1 flex-col bg-background">
      <header>
        <Container className="flex items-center py-6 sm:py-8">
          <Link
            href="/"
            className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Wordmark size={28} mark />
          </Link>
        </Container>
      </header>
      <main className="flex-auto">
        <Container>
          <article className="mx-auto max-w-[680px] pb-16">
            <h1 className="font-display text-large-title text-label">{title}</h1>
            <p className="mt-2 text-subheadline text-label-secondary">
              Last updated {updated}
            </p>
            <div className="mt-6 flex flex-col gap-4 text-body text-label">
              {intro}
            </div>
            {children}
          </article>
        </Container>
      </main>
      <Footer />
    </div>
  );
}

export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-10 scroll-mt-6">
      <h2 id={`${id}-title`} className="font-display text-title-2 text-label">
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-4 text-body text-label">{children}</div>
    </section>
  );
}

export function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-2 text-headline text-label">{children}</h3>;
}

export function List({ children }: { children: React.ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-6 marker:text-label-secondary">{children}</ul>;
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  const className =
    "text-tint-text underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
  if (href.startsWith("/") || href.startsWith("#")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className} rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function ContactEmail() {
  return <TextLink href={`mailto:${LEGAL.email}`}>{LEGAL.email}</TextLink>;
}

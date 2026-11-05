import type { Copy } from "@/lib/cms/model";
import { getCopy, getSiteCopy } from "@/lib/cms/content";
import Link from "next/link";

import { Container } from "@/components/landing/Container";
import { Wordmark } from "@/components/ui/Wordmark";

const links = (copy: Copy<"footer">) => [
  { href: "/about", label: copy.aboutLabel },
  { href: "/faq", label: copy.faqLabel },
  { href: "/terms", label: copy.termsLabel },
  { href: "/privacy", label: copy.privacyLabel },
] as const;

export async function Footer() {
  const [copy, site] = await Promise.all([getCopy("footer"), getSiteCopy()]);
  return (
    <footer className="border-t border-separator">
      <Container className="flex flex-col items-center justify-between gap-x-6 gap-y-3 py-8 text-footnote text-label-secondary lg:flex-row lg:flex-wrap">
        <Wordmark size={16} />
        <p className="text-center leading-6">
          <span className="block whitespace-nowrap sm:inline">{copy.makerLocation} <span aria-hidden="true">💜</span></span> <span aria-hidden="true" className="hidden sm:inline"> · </span><span className="inline-block">{copy.makerBy}{" "}
          <a href={site.instagramUrl} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{copy.makerLinkLabel}</a>, {copy.makerFor}</span>
        </p>
        <div className="flex items-center gap-1">
          <nav aria-label="Footer" className="flex items-center">
            {links(copy).map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex min-h-11 items-center rounded-sm px-2 text-label-secondary underline-offset-2 hover:text-label hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {label}
              </Link>
            ))}
          </nav>
          <a href="https://www.instagram.com/stubbedapp/" aria-label={copy.instagramLabel} className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm hover:text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.75" fill="currentColor" stroke="none" /></svg>
          </a>
          <p className="pl-1">&copy; Stubbed</p>
        </div>
      </Container>
    </footer>
  );
}

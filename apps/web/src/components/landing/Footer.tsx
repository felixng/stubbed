import type { Copy } from "@/lib/cms/model";
import { getCopy } from "@/lib/cms/content";
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
  const copy = await getCopy("footer");
  return (
    <footer className="border-t border-separator">
      <Container className="flex flex-col items-center justify-between gap-2 py-8 text-footnote text-label-secondary sm:flex-row">
        <Wordmark size={16} />
        <p>{copy.builtByATheatreRegularFor}</p>
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
          <p className="pl-1">&copy; Stubbed</p>
        </div>
      </Container>
    </footer>
  );
}

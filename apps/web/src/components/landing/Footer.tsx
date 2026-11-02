import Link from "next/link";

import { Container } from "@/components/landing/Container";
import { Wordmark } from "@/components/ui/Wordmark";

const LINKS = [
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-separator">
      <Container className="flex flex-col items-center justify-between gap-2 py-8 text-footnote text-label-secondary sm:flex-row">
        <Wordmark size={16} />
        <p>Built by a theatre regular, for the theatre regulars.</p>
        <div className="flex items-center gap-1">
          <nav aria-label="Footer" className="flex items-center">
            {LINKS.map(({ href, label }) => (
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

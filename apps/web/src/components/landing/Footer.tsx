import Link from "next/link";

import { Container } from "@/components/landing/Container";
import { Wordmark } from "@/components/ui/Wordmark";

const LINKS = [
  { href: "/faq", label: "FAQ" },
  { href: "/press", label: "Press kit" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "mailto:support@getstubbed.app", label: "Email" },
] as const;

const LINK =
  "inline-flex min-h-11 items-center rounded-sm px-2 underline-offset-2 hover:text-label hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// A minimal footer (#239): the logo and a line, a few links, and who makes
// it, linking to the developer's site.
export function Footer() {
  return (
    <footer className="border-t border-separator">
      <Container className="flex flex-col items-center gap-4 py-10 text-center text-footnote text-label-secondary">
        <div className="flex flex-col items-center gap-1">
          <Wordmark size={20} mark />
          <p>Your social theatre diary</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap justify-center">
          {LINKS.map(({ href, label }) => (
            <Link key={href} href={href} className={`${LINK} text-label-secondary`}>
              {label}
            </Link>
          ))}
        </nav>
        <p>
          Made by{" "}
          <a href="https://felix.ng" className="font-semibold text-label underline-offset-2 hover:underline">
            Felix
          </a>{" "}
          · &copy; Stubbed
        </p>
      </Container>
    </footer>
  );
}

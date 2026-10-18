// Details the Terms and Privacy Policy depend on, kept in one place so the
// two pages can't disagree. Bump `updated` whenever either page changes in
// substance, and tell users about material changes (see both pages).
type Legal = {
  // The person or company legally responsible for Stubbed (the "controller"),
  // and a postal address for legal notices. Left out for the private beta
  // (owner's call). UK/EU GDPR Art. 13 and the UK E-Commerce Regulations 2002
  // expect both, so fill them in before public launch; the pages show them
  // as soon as they're set.
  operator: string | null;
  address: string | null;
  // Monitored inbox for privacy requests, legal notices and content reports.
  email: string;
  // Decides the Terms' governing law and courts.
  governingLaw: string;
  courts: string;
  // Shown as "Last updated" on both pages.
  updated: string;
  // Everyone must be at least this old to use Stubbed.
  minimumAge: number;
};

export const LEGAL: Legal = {
  operator: null,
  address: null,
  email: "support@getstubbed.app",
  governingLaw: "England and Wales (United Kingdom)",
  courts: "the courts of England and Wales",
  updated: "18 October 2026",
  minimumAge: 16,
};

// "Stubbed", or "Stubbed (Jane Doe, 1 High Street, London)" once set.
export function operatorName() {
  const details = [LEGAL.operator, LEGAL.address].filter(Boolean).join(", ");
  return details ? `Stubbed (${details})` : "Stubbed";
}

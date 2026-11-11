// Details the Terms and Privacy Policy depend on, kept in one place so the
// two pages can't disagree. Bump `updated` whenever either page changes in
// substance, and tell users about material changes (see both pages).
// CMS-enabled pages use their own editable dates; this is the repo fallback.
type Legal = {
  // The person or company legally responsible for Stubbed (the "controller"),
  // and a postal address for legal notices. Act II Limited is the seller of
  // Stubbed Pro (owner, 9 Nov 2026). UK/EU GDPR Art. 13 and the UK E-Commerce
  // Regulations 2002 expect the address too, so fill it in before Pro goes on
  // sale; the pages show it as soon as it's set.
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
  operator: "Act II Limited",
  address: null,
  email: "support@getstubbed.app",
  governingLaw: "England and Wales (United Kingdom)",
  courts: "the courts of England and Wales",
  updated: "11 November 2026",
  minimumAge: 16,
};

// "Stubbed", or "Stubbed (Jane Doe, 1 High Street, London)" once set.
export function operatorName() {
  const details = [LEGAL.operator, LEGAL.address].filter(Boolean).join(", ");
  return details ? `Stubbed (${details})` : "Stubbed";
}

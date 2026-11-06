import { LEGAL } from "@/lib/legal";

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
  steps?: readonly string[];
  link?: { href: string; label: string };
};

type FaqSection = {
  id: string;
  title: string;
  items: readonly FaqItem[];
};

// Public help, JSON-LD and llms.txt all use this copy. Guides describe the web
// app explicitly so their controls don't imply parity with native iOS screens.
export const FAQ_SECTIONS: readonly FaqSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    items: [
      {
        id: "what-is-stubbed",
        question: "What is Stubbed?",
        answer: "Stubbed is a theatre diary. Log the plays, musicals, opera, dance, comedy and stand-up you see, add a rating, note or photo, and look back at your visits. Group shows into trips and share cards with friends. It works for any theatre, anywhere.",
        link: { href: "/about", label: "Read the story behind Stubbed" },
      },
      {
        id: "sign-up",
        question: "Can I sign up now?",
        answer: "Yes. Stubbed is in public beta. Sign up free with Apple, Google or your email, choose a handle and log your first show. You don’t need followers to keep a diary.",
        link: { href: "/signup", label: "Sign up" },
      },
      {
        id: "android",
        question: "How do I install Stubbed on Android?",
        answer: "Use Stubbed in your browser, or add the web app to your home screen. You don’t need a Play Store download. In Chrome on Android:",
        steps: [
          "Open getstubbed.app and sign in.",
          "Open Chrome’s 3-dot menu.",
          "Tap Install and create shortcut → Install. Depending on your Chrome version, this may be called Add to Home screen or Install app.",
          "Confirm the prompt, then open Stubbed from your home screen. It opens in its own window, without the browser toolbar.",
        ],
        link: { href: "/login", label: "Open Stubbed in your browser" },
      },
    ],
  },
  {
    id: "your-diary",
    title: "Your diary",
    items: [
      {
        id: "log-a-show",
        question: "How do I log a show?",
        answer: "On the website, open Log and pick a photo, or choose No photo? Fill in by hand. A photo can suggest the date and nearby theatre. Check the details, add an optional half-star rating, note and photo, choose Public or Private, then save. Suggestions can be wrong; you can change them before saving.",
        link: { href: "/app/log", label: "Log a show" },
      },
      {
        id: "past-and-planned-shows",
        question: "Can I add past shows or shows I plan to see?",
        answer: "Yes. Set the date to when you went, even if it was years ago. A future date creates a planned show in Upcoming, without a rating. After you’ve been, edit that entry to log the visit and add your thoughts.",
      },
      {
        id: "missing-shows",
        question: "What if the show or theatre isn’t listed?",
        answer: "You can add a show or venue while logging. Search first, then use the option to add it if it’s missing. Stubbed covers any theatre, anywhere, including small productions and repeat visits.",
      },
      {
        id: "trips-and-sharing",
        question: "Can I group shows into a trip and share them?",
        answer: "Yes. Open Trips on your Profile and create a trip with start and end dates, then add visits within those dates. Open a saved show or trip to make a share card you can save or share to Instagram and elsewhere. People can keep images you share, even if you later make the entry private.",
      },
    ],
  },
  {
    id: "import-and-data",
    title: "Import and data",
    items: [
      {
        id: "import-emails",
        question: "Can I import ticket emails?",
        answer: "Not at the moment. Email import is paused, and Stubbed never reads or stores your emails. You can add past shows by hand, or bring them in from theatre photos on the website.",
      },
      {
        id: "import-photos",
        question: "How do I import theatre photos?",
        answer: "On the website, open Import shows and tap Choose photos. Pick curtain shots, programmes, Playbills or ticket photos. Stubbed uses the photos and available date and location details to suggest visits. Review every draft, fill in anything missing, untick unwanted entries, then tap Save. Each web import photo becomes a separate draft, so check for multiple photos from the same visit. An entry holds 1 photo.",
        link: { href: "/app/import/photos", label: "Import photos on the website" },
      },
      {
        id: "theaterdiary",
        question: "Can I import my Mezzanine diary?",
        answer: "Yes. Open Import shows and choose Mezzanine export, then pick the CSV or JSON file Mezzanine made. Review your shows, choose any missing countries, and import. Shows, theatres, dates, ratings and reviews are supported. Private notes, photos, seats, tags and lists aren’t imported.",
        link: { href: "/app/import/mezzanine", label: "Import from Mezzanine" },
      },
      {
        id: "export",
        question: "Can I export my diary?",
        answer: `CSV export is planned, but there is no export button yet. To request a copy of your data now, email ${LEGAL.email} from the email address on your account.`,
        link: { href: `mailto:${LEGAL.email}`, label: "Request a copy of your data" },
      },
    ],
  },
  {
    id: "privacy-and-help",
    title: "Privacy and help",
    items: [
      {
        id: "entry-privacy",
        question: "Are my entries public?",
        answer: "New accounts start with public entries. Choose Private when adding or editing an entry to make it visible only to you, including hiding it from followers. To limit your profile’s shows, trips and stats to you and approved followers, turn on Private profile in Settings → Profile privacy and save. Your handle, name, avatar, bio and link remain visible. Existing followers stay approved when you go private.",
        link: { href: "/app/settings/privacy", label: "Open profile privacy" },
      },
      {
        id: "photo-privacy",
        question: "What happens to my photos?",
        answer: "Photos are re-encoded on your device to remove EXIF and GPS metadata before upload. Stubbed can use the photo’s date and location to find nearby theatres. No photo is sent to an AI service. You review everything before saving, and you can log by hand without a photo instead.",
        link: { href: "/privacy#collect", label: "Read how photo data is used" },
      },
      {
        id: "delete-account",
        question: "Can I delete my account?",
        answer: "Yes. On the website, open Settings → Delete account, type your handle and confirm. This permanently deletes your account, diary, trips and photos from the live service and can’t be undone. Shows and venues you added stay in the shared catalogue. Backup retention is explained in the privacy policy.",
        link: { href: "/privacy#retention", label: "Read about data retention" },
      },
      {
        id: "contact",
        question: "How do I get help or suggest something?",
        answer: `Email ${LEGAL.email} with your question, a bug report or an idea. For a bug, include what you were doing and which device and browser you used.`,
        link: { href: `mailto:${LEGAL.email}`, label: "Contact support" },
      },
    ],
  },
];

export const FAQS = FAQ_SECTIONS.flatMap((section) => section.items);

// Include every visible instruction and action in text-only consumers too.
export function faqAnswerText(faq: FaqItem): string {
  return [
    faq.answer,
    ...(faq.steps ?? []).map((step, index) => `${index + 1}. ${step}`),
    ...(faq.link ? [faq.link.label] : []),
  ].join("\n");
}

export async function getFaqSections(): Promise<readonly FaqSection[]> {
  const { getCopy } = await import("@/lib/cms/content");
  const copy = await getCopy("faqEntries");
  const values = copy as Record<string, string>;
  const keyFor = (id: string) => id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  return FAQ_SECTIONS.map((section, index) => ({
    ...section, title: values[`section${index}Title`],
    items: section.items.map((item) => {
      const key = keyFor(item.id);
      return { ...item, question: values[`${key}Question`], answer: values[`${key}Answer`],
        steps: item.steps?.map((_, index) => values[`${key}Step${index}`]),
        link: item.link ? { ...item.link, label: values[`${key}LinkLabel`] } : undefined,
      };
    }),
  }));
}

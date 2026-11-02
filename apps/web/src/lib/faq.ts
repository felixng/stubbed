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
        answer: "On the website, open Log and pick a photo, or choose No photo? Fill in by hand. A photo can suggest the date, nearby theatre and show. Check the details, add an optional half-star rating, note and photo, choose Public or Private, then save. Suggestions can be wrong; you can change them before saving.",
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
        question: "How do I import ticket emails?",
        answer: "Use Import shows on the website. Stubbed reads ticket confirmation emails into drafts; nothing is saved until you review it.",
        steps: [
          "Open Settings → Import shows, or follow the import link from Log.",
          "Choose emails to upload .eml, .mbox, .html or .txt files. Or open Or paste an email, paste the whole confirmation and tap Read email. Outlook .msg files aren’t supported; save as .eml instead.",
          "Review each draft’s show, theatre and performance date. Correct missing or wrong details and untick anything you don’t want to keep.",
          "Tap Save to save the selected shows. They use your default visibility; you can change each entry afterwards.",
        ],
        link: { href: "/app/import", label: "Import shows on the website" },
      },
      {
        id: "import-photos",
        question: "How do I import theatre photos?",
        answer: "On the website, open Import shows and tap Choose photos. Pick curtain shots, programmes, Playbills or ticket photos. Stubbed uses the photos and available date and location details to suggest visits. Review every draft, fill in anything missing, untick unwanted entries, then tap Save. Each web import photo becomes a separate draft, so check for multiple photos from the same visit. An entry holds 1 photo.",
        link: { href: "/app/import", label: "Import photos on the website" },
      },
      {
        id: "forward-emails",
        question: "Can I forward emails directly to Stubbed?",
        answer: "Not yet. There is no Stubbed forwarding address. Upload saved email files or paste confirmation emails into Import shows on the website instead.",
      },
      {
        id: "theaterdiary",
        question: "Can I import a TheaterDiary CSV?",
        answer: "Not yet. TheaterDiary CSV import isn’t available. You can add past shows by hand, or bring them in from ticket emails and theatre photos on the website.",
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
        question: "What happens to my photos and email text?",
        answer: "Photos are re-encoded on your device to remove EXIF and GPS metadata before upload. Photo detection can still use the date and location to find nearby theatres, and sends a clean photo and context to an AI provider to suggest the show. Imported email text is also sent to an AI provider to read the booking details. You review the results before saving. You can log by hand without a photo or email instead.",
        link: { href: "/privacy#collect", label: "Read how photo and email data is used" },
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

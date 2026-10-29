// Questions people ask before signing up. The same list feeds the FAQPage
// structured data on /faq, so the two can't drift. No prices or dates.
export const FAQS = [
  {
    question: "Can I sign up for Stubbed now?",
    answer:
      "Yes. Sign up free with Apple, Google or your email, pick a handle and log your first show. Stubbed is in public beta, so expect it to keep improving.",
  },
  {
    question: "Can I add shows I saw before joining?",
    answer:
      "Yes. Paste or upload your ticket confirmation emails, or add photos from shows you’ve been to, and Stubbed reads the show, venue and date and suggests entries. Nothing is saved until you have checked it.",
  },
  {
    question: "Are my entries public?",
    answer:
      "Entries start public so they are easy to share, and you can make any entry private with one tap. Photos have their location data removed before they are uploaded.",
  },
  {
    question: "Can I export my data?",
    answer:
      "Your diary is yours. You’ll be able to download all of it as a CSV file at any time.",
  },
];

export function Faq() {
  return (
    <div className="flex flex-col gap-6">
      {FAQS.map((faq) => (
        <div key={faq.question} className="flex flex-col gap-1">
          <h2 className="text-headline text-label">{faq.question}</h2>
          <p className="text-body text-label-secondary">{faq.answer}</p>
        </div>
      ))}
    </div>
  );
}

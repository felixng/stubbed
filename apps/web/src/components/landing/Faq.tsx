import { getCopy } from "@/lib/cms/content";
import Link from "next/link";

import { getFaqSections } from "@/lib/faq";

const textLink = "rounded-sm text-tint-text underline underline-offset-4 hover:text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export async function Faq() {
  const [copy, FAQ_SECTIONS] = await Promise.all([getCopy("faqIntro"), getFaqSections()]);
  return (
    <div className="flex flex-col gap-10">
      <p className="text-body text-label-secondary">
        {copy.aFewAnswersAndPracticalGuides}
      </p>
      <nav aria-label="FAQ topics" className="flex flex-wrap gap-x-5 gap-y-1 border-y border-separator py-3">
        {FAQ_SECTIONS.map((section) => (
          <a key={section.id} href={`#${section.id}`} className={`${textLink} inline-flex min-h-11 items-center text-subheadline font-medium`}>
            {section.title}
          </a>
        ))}
      </nav>
      {FAQ_SECTIONS.map((section) => (
        <section key={section.id} aria-labelledby={section.id} className="flex flex-col gap-6">
          <h2 id={section.id} className="scroll-mt-6 font-display text-title-2 text-label">{section.title}</h2>
          {section.items.map((faq) => (
            <div key={faq.id} className="flex flex-col gap-2">
              <h3 id={faq.id} className="scroll-mt-6 text-headline text-label">{faq.question}</h3>
              <p className="text-body text-label-secondary">{faq.answer}</p>
              {faq.steps && (
                <ol className="list-decimal space-y-2 pl-6 text-body text-label-secondary marker:text-label">
                  {faq.steps.map((step) => <li key={step} className="pl-1">{step}</li>)}
                </ol>
              )}
              {faq.link && (
                <p className="text-body"><Link href={faq.link.href} className={textLink}>{faq.link.label}</Link></p>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

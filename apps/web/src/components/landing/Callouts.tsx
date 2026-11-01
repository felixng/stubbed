import { Container } from "@/components/landing/Container";

// The minor callouts (#239): smaller than the four features and laid out
// differently, as a row of compact cards. Our own claims only: the
// reference site's privacy and indie lines are not Stubbed's.
const CALLOUTS: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: "Made by a theatre nerd, for theatre nerds",
    body: "Stubbed is built by Felix, who once saw more than 100 shows in a year and served on an Olivier Awards panel. It’s the diary he wanted.",
    icon: (
      // Theatre masks.
      <path d="M4 5.5c2.7-1.3 5.3-1.3 8 0v5a4 4 0 0 1-8 0v-5ZM6.5 9h.01M9.5 9h.01M6.8 11.5a2 2 0 0 0 2.4 0M12 8c2.7-1.3 5.3-1.3 8 0v5a4 4 0 0 1-8 0M14.5 11.5h.01M17.5 11.5h.01M14.8 15a2 2 0 0 1 2.4 0" />
    ),
  },
  {
    title: "Ad free",
    body: "No ads in your diary, your feed or the cards you share. Just your shows.",
    icon: (
      // A circle with a line through it.
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="m6 6 12 12" />
      </>
    ),
  },
  {
    title: "Small and independent",
    body: "One person makes Stubbed, not a company. Ideas and bug reports go straight to the person who builds it, and shape what comes next.",
    icon: (
      // A ticket.
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4V7.5ZM14 6v12" />
    ),
  },
];

export function Callouts() {
  return (
    <section aria-label="Why Stubbed" className="pt-8 pb-20 sm:pb-28">
      <Container>
        <ul className="grid gap-4 md:grid-cols-3">
          {CALLOUTS.map(({ title, body, icon }) => (
            <li key={title} className="flex flex-col gap-3 rounded-[24px] bg-surface p-6 ring-1 ring-separator sm:p-7">
              <span className="flex size-11 items-center justify-center rounded-pill bg-tint-fill text-tint-text">
                <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  {icon}
                </svg>
              </span>
              <h3 className="font-display text-[21px] leading-7 font-bold tracking-[-0.01em] text-balance text-label">{title}</h3>
              <p className="text-body leading-6 text-pretty text-label-secondary">{body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

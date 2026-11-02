import { Container } from "@/components/landing/Container";

// "Built for theatre lovers" (#239, from the landing copy audit): smaller
// features in a balanced 2×2 grid of rounded cards, after the four big ones.
// Each line describes something the app does today.
const CALLOUTS: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: "Quick logging",
    body: "Search for the show and the theatre, pick the date, and you’re done. Start from a photo and Stubbed fills in what it can.",
    icon: (
      // A plus in a circle.
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 8v8M8 12h8" />
      </>
    ),
  },
  {
    title: "Notes that are yours",
    body: "Add a note to any show: who you went with, where you sat, who stole the show.",
    icon: (
      // A pencil.
      <path d="M4.5 19.5 5.5 15 15.5 5a2.1 2.1 0 0 1 3 3l-10 10-4 1.5ZM13.5 7l3 3" />
    ),
  },
  {
    title: "Sharing in one tap",
    body: "Cards sized for Instagram Stories, and a link for group chats, so friends can see what you saw.",
    icon: (
      // Share: a box with an arrow out of it.
      <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8M6 11.5H5v9h14v-9h-1" />
    ),
  },
  {
    title: "Your diary, your choice",
    body: "Keep any show private, make your whole profile private, or share it all with everyone.",
    icon: (
      // A lock.
      <>
        <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
        <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
      </>
    ),
  },
];

export function Callouts() {
  return (
    <section aria-labelledby="callouts-heading" className="pt-8 pb-20 sm:pb-28">
      <Container className="flex flex-col gap-8">
        <h2
          id="callouts-heading"
          className="text-center font-display text-[clamp(32px,4.4vw,48px)] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance text-label"
        >
          Built for theatre lovers
        </h2>
        <ul className="mx-auto grid w-full max-w-[1040px] gap-4 md:grid-cols-2">
          {CALLOUTS.map(({ title, body, icon }) => (
            <li key={title} className="flex flex-col gap-3 rounded-[28px] bg-surface p-7 ring-1 ring-separator sm:p-9">
              <span className="flex size-11 items-center justify-center rounded-pill bg-tint-fill text-tint-text">
                <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  {icon}
                </svg>
              </span>
              <h3 className="font-display text-[22px] leading-7 font-bold tracking-[-0.01em] text-balance text-label">{title}</h3>
              <p className="text-body leading-6 text-pretty text-label-secondary">{body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

import { Container } from "@/components/landing/Container";
import { Phone, type Shot } from "@/components/landing/Screens";

// The four central callouts (#238), sharing first: big alternating rows,
// each with the part of the app it describes. The screenshots come from
// the iOS app (Screens.tsx); there's no screenshot of Upcoming yet, so
// "Plan ahead" shows the list drawn in HTML, as the app lays it out.
const FEATURES: { eyebrow: string; title: string; body: string; shot?: Shot; alt?: string }[] = [
  {
    eyebrow: "Made to share",
    title: "Share with your friends",
    body: "Turn any show into a card for your Stories, with your photo, the show, your stats and your handle. Pick a design and post it in a tap.",
    shot: "share",
    alt: "A share card for The Lost Boys: the photo, four and a half stars and the handle @sillyelphaba",
  },
  {
    eyebrow: "Your diary",
    title: "Track your visits",
    body: "Every show you see in one place: the theatre, the date, your half-star rating and a note. Start from a photo and Stubbed fills in what it can.",
    shot: "log",
    alt: "Logging The Lost Boys: a photo from the show, the Palace Theatre, the date and four and a half stars",
  },
  {
    eyebrow: "The bigger picture",
    title: "Trips and stats",
    body: "Group a weekend away or a festival’s shows into a trip, and see your year in theatre: how many shows, which theatres, your streaks.",
    shot: "plan",
    alt: "A trip called Birthday weekend: 2 shows at 2 venues, Cabaret and Groundhog Day",
  },
  {
    eyebrow: "What’s next",
    title: "Plan ahead",
    body: "Add the shows you’ve booked with their date. They wait under Upcoming, and become part of your diary once you’ve been.",
  },
];

export function Features() {
  return (
    <section id="features" aria-label="Features" className="scroll-mt-8 pb-12 sm:pb-16">
      <Container className="flex flex-col gap-20 sm:gap-28">
        {FEATURES.map((feature, index) => (
          <div
            key={feature.title}
            className={`flex flex-col items-center gap-10 lg:gap-20 ${index % 2 ? "lg:flex-row-reverse" : "lg:flex-row"}`}
          >
            <div className="flex max-w-[520px] flex-col gap-4 lg:flex-[1_1_480px]">
              <p className="text-subheadline font-semibold text-tint-text">{feature.eyebrow}</p>
              <h2 className="font-display text-[clamp(36px,5vw,56px)] leading-[1.04] font-extrabold tracking-[-0.03em] text-balance text-label">
                {feature.title}
              </h2>
              <p className="text-[19px] leading-[1.45] text-pretty text-label-secondary">{feature.body}</p>
            </div>
            <Visual feature={feature} />
          </div>
        ))}
      </Container>
    </section>
  );
}

// A white panel with the sweep glowing behind the phone, which sits at the
// top and runs off the bottom edge.
function Visual({ feature }: { feature: (typeof FEATURES)[number] }) {
  return (
    <div className="relative aspect-[4/5] w-full max-w-[460px] overflow-hidden rounded-[32px] border border-separator bg-surface lg:flex-[1_1_460px]">
      <div
        aria-hidden="true"
        className="absolute top-[14%] left-1/2 h-[90%] w-[62%] -translate-x-1/2 rounded-[40%] bg-sweep opacity-50 blur-[56px]"
      />
      <div className={`absolute inset-0 flex justify-center ${feature.shot ? "pt-10 sm:pt-12" : "items-center"}`}>
        {feature.shot ? (
          <Phone shot={feature.shot} label={feature.alt ?? ""} sizes="(min-width: 640px) 300px, 66vw" className="relative h-fit w-[66%]" />
        ) : (
          <UpcomingList />
        )}
      </div>
    </div>
  );
}

// Upcoming, as the app's diary shows it: an inset grouped list of booked
// shows, each with its poster initials, theatre and date.
const UPCOMING = [
  { title: "Hadestown", initials: "H", where: "Lyric Theatre", date: "Fri 20 Nov" },
  { title: "Operation Mincemeat", initials: "OM", where: "Fortune Theatre", date: "Sat 5 Dec" },
  { title: "Les Misérables", initials: "LM", where: "Sondheim Theatre", date: "Thu 7 Jan" },
];

function UpcomingList() {
  return (
    <figure className="relative flex w-[84%] flex-col gap-2 text-left">
      <figcaption className="px-4 text-footnote font-semibold text-label-secondary">Upcoming</figcaption>
      <ul className="flex flex-col rounded-[22px] bg-background p-1.5 shadow-sm ring-1 ring-separator">
        {UPCOMING.map((show, i) => (
          <li key={show.title} className={`flex items-center gap-3 px-3 py-3 ${i ? "border-t border-separator" : ""}`}>
            <span
              aria-hidden="true"
              className="flex h-14 w-11 shrink-0 items-center justify-center rounded-[8px] bg-sweep font-display text-subheadline font-bold text-white"
            >
              {show.initials}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-headline text-label">{show.title}</span>
              <span className="truncate text-footnote text-label-secondary">
                {show.where} · {show.date}
              </span>
              <span className="text-footnote font-semibold text-tint-text">Going</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

import { getCopy } from "@/lib/cms/content";
import { Container } from "./Container";
import { LandingAction } from "./LandingAction";

export async function SignUpReminder() {
  const copy = await getCopy("sharingLanding");
  return (
    <section aria-labelledby="reminder-heading" className="bg-background py-16 sm:py-20">
      <Container className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
        <div>
          <h2 id="reminder-heading" className="font-display text-[clamp(32px,3.5vw,48px)] leading-[1.1] font-bold tracking-[-0.03em] text-label">{copy.closingHeading}</h2>
          <p className="mt-4 text-body text-label-secondary">{copy.closingBody}</p>
        </div>
        <div className="shrink-0"><LandingAction>{copy.signup}</LandingAction></div>
      </Container>
    </section>
  );
}

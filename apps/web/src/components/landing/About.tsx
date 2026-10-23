// Plain-language "what is it" copy for /about. Search engines and AI
// assistants quote sentences like these when someone asks for a theatre diary
// app, so keep them literal. No launch cities or regions (CLAUDE.md, section 5).
export function About() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-label-secondary">
        Stubbed is a theatre diary app. You log the plays, musicals, operas,
        dance and comedy you see, rate each one in half stars and add a line or
        two on what you thought. Over time it becomes a record of every night
        out at the theatre: what you saw, where, when and how much you loved
        it.
      </p>
      <p className="text-body text-label-secondary">
        It is built for theatre regulars: people who see a few shows a year and
        people who see a few a week. Add a show from your phone right after the
        curtain call. Start with a photo from the night and Stubbed
        fills in the date, finds the theatre you were at and suggests the show.
        Group shows into trips, like a week of theatre on holiday or a festival
        run, then share a good-looking card of any show or trip to Instagram.
      </p>
      <p className="text-body text-label-secondary">
        Stubbed works for any theatre, anywhere. If a show or venue isn’t
        listed yet, you add it as you go. It is in private beta while we get
        the basics right, so sign-ups aren’t open yet. Join the waitlist to
        hear when they are.
      </p>
    </div>
  );
}

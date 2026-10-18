import type { Metadata, Viewport } from "next";

import {
  ContactEmail,
  LegalPage,
  List,
  Section,
  SubHeading,
  TextLink,
} from "@/components/legal/LegalPage";
import { LEGAL, operatorName } from "@/lib/legal";

// Written for UK GDPR + the Data Protection Act 2018, the EU GDPR, PECR /
// ePrivacy, and US state privacy laws (CCPA/CPRA and similar, CalOPPA,
// COPPA). Keep it in step with what the code actually does: if a feature
// starts collecting or sharing something new, update this page and
// LEGAL.updated in the same change.
export const metadata: Metadata = {
  title: "Privacy Policy — Stubbed",
  description: "What Stubbed collects, why, who it is shared with, and your rights.",
};

export const viewport: Viewport = { themeColor: "#fff9f6" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <>
          <p>
            Stubbed is a theatre diary: you track the shows you see, rate them and
            share them. This policy explains what personal data we collect, why,
            who we share it with, how long we keep it, and the rights you have
            wherever you live, including in the UK, the European Union and the
            United States.
          </p>
          <p>
            The short version: we collect only what the app needs to work, we
            never sell your data or use it for advertising, and you can ask us
            for a copy of it or to delete it at any time.
          </p>
        </>
      }
    >
      <Section id="who" title="Who we are">
        <p>
          {operatorName()} (“we”, “us”) is the controller of your personal data under the UK GDPR
          and the EU GDPR, and the “business” for the purposes of US state
          privacy laws.
        </p>
        <p>
          For anything about privacy, including exercising your rights, email{" "}
          <ContactEmail />. We don’t have a Data Protection Officer because the
          law doesn’t require one for a service of our size and nature.
        </p>
      </Section>

      <Section id="collect" title="What we collect and why">
        <p>
          For each kind of data below we say why we use it and, for people in
          the UK and EU, the legal basis that allows it.
        </p>

        <SubHeading>Waitlist</SubHeading>
        <List>
          <li>
            <strong>Your email address</strong>, so we can invite you when
            spaces open up. We email you once to confirm you signed up, and you
            join the list only after you tap the link. Legal basis: your
            consent, which you can withdraw at any time, including from the
            unsubscribe link in any email we send.
          </li>
          <li>
            <strong>Where you came from</strong> (a campaign tag or the
            referring website), so we know which links bring people to Stubbed.
            It’s stored with your email. Legal basis: our legitimate interest in
            understanding how people find us.
          </li>
        </List>

        <SubHeading>Your account</SubHeading>
        <List>
          <li>
            <strong>Email address and password.</strong> Passwords are stored
            only as a secure hash by our authentication provider; we can’t see
            them.
          </li>
          <li>
            <strong>If you sign in with Google</strong>, Google shares your name,
            email address and profile picture with us. We don’t get your Google
            password or access to anything else in your Google account.
          </li>
          <li>
            <strong>If you sign in with Apple</strong>, Apple shares your name
            and email address with us (or a private relay address, if you choose
            to hide your email). We don’t get your Apple Account password or
            access to anything else in your Apple Account.
          </li>
          <li>
            <strong>Your profile</strong>: handle, display name, avatar, bio, a
            link if you add one, and your default visibility setting.
          </li>
        </List>
        <p>
          Legal basis: performing our contract with you (the{" "}
          <TextLink href="/terms">Terms</TextLink>), since we can’t give you an
          account without them.
        </p>

        <SubHeading>Your diary</SubHeading>
        <List>
          <li>
            <strong>Entries</strong>: the show, venue and date, and optionally a
            rating, a note and a photo.
          </li>
          <li>
            <strong>Trips and labels</strong> you create, and the entries in
            them.
          </li>
          <li>
            <strong>Shows and venues you add</strong> to the shared catalogue.
            These are visible to everyone and may stay in the catalogue if you
            leave, without your name attached.
          </li>
        </List>
        <p>
          Legal basis: performing our contract with you. Please don’t put
          sensitive information (for example about your health, beliefs or
          sexuality) in notes, especially public ones.
        </p>

        <SubHeading>Photos and show detection</SubHeading>
        <p>
          When you add a photo to an entry, your browser reads the date, time and
          location the photo was taken from its metadata (EXIF), then makes a
          resized copy with all metadata removed. Only that clean copy is
          uploaded. The original photo never leaves your device, and we never
          store the photo’s location.
        </p>
        <p>To suggest the show and venue for you, we may also:</p>
        <List>
          <li>
            send the photo’s location to OpenStreetMap services to look up
            nearby theatres and the city. This is sent from our servers without
            your name, email or any account identifier;
          </li>
          <li>
            send the clean copy of the photo, its date and time, an approximate
            location (rounded to about 100 metres) and the nearby theatres to
            an AI provider (see{" "}
            <TextLink href="#sharing">who we share data with</TextLink>), which
            may search the web to identify the show.
          </li>
        </List>
        <p>
          Suggestions are only suggestions: nothing is saved until you confirm
          it, and you can always fill in an entry by hand without a photo.
          Legal basis: performing our contract with you, as this is a feature
          you choose to use. We don’t make any decisions about you by
          automated means that have legal or similarly significant effects.
        </p>

        <SubHeading>Importing ticket emails</SubHeading>
        <p>
          If you import booking confirmation emails, your browser opens the
          email files and sends only their readable text (subject, sender, date
          and body) to our servers, where an AI provider reads out the show,
          venue, date, time, seats and price. Booking emails can contain other
          details, such as your name, address or an order number; we don’t
          look for or keep them. The email text isn’t stored or logged: you get
          draft entries to review, and only what you confirm is saved. Legal
          basis: performing our contract with you, as this is a feature you
          choose to use.
        </p>

        <SubHeading>Technical data</SubHeading>
        <p>
          Like any website, our hosting and database providers log technical
          details of each request, such as your IP address, browser type and the
          pages you visit, to keep the service running and secure. Legal basis:
          our legitimate interest in operating a secure service.
        </p>

        <SubHeading>Usage statistics</SubHeading>
        <p>
          To learn what works and what to improve, we count:
        </p>
        <List>
          <li>
            <strong>Visits to our public pages</strong> (the home page, these
            legal pages and public profiles), using Vercel Web Analytics and
            Google Analytics: the page, the referring website, and your
            country, device type and browser. Both run without cookies, and we
            don’t identify you or follow you across websites or from one day to
            the next. Google Analytics runs with storage and advertising
            features switched off, so Google gets a cookieless signal it can’t
            tie to a returning visitor or use for ads. Pages inside your
            account aren’t counted.
          </li>
          <li>
            <strong>Some things you do in your account</strong>: when you add
            a new show (whether you started from a photo, whether we could
            work out the show, and whether you added a rating or a note, but not
            what they say), and when you share, save or copy a share card
            (which button and card design). This is stored with your account so
            we can see how many people keep tracking and sharing.
          </li>
        </List>
        <p>
          Legal basis: our legitimate interest in understanding how Stubbed is
          used so we can improve it.
        </p>
      </Section>

      <Section id="public" title="What other people can see">
        <p>
          Your handle, display name, avatar, bio and link are public, on your
          profile page at /@yourhandle. The page also shows your public entries
          and their photos, plus stats and a calendar based only on public
          entries. Make your profile private in your settings and only you can
          see your entries, trips, photos and stats; your handle, name, avatar,
          bio and link stay visible. Otherwise, entries and trips
          are <strong>public by default</strong>: anyone, including people
          without an account and search engines, can see them, along with any
          photo attached. You can make any entry or trip private, or change your
          default to private, at any time. Private entries are visible only to
          you.
        </p>
        <p>
          If you share a card or a link, the people and services you share it
          with (for example Instagram or WhatsApp) can see and keep what you
          shared, under their own privacy policies.
        </p>
      </Section>

      <Section id="cookies" title="Cookies">
        <p>
          We use only cookies that are strictly necessary to keep you signed in
          and protect your account. We don’t use analytics, advertising or
          tracking cookies, so we don’t ask for cookie consent. The landing page
          sets no cookies at all; our visit statistics work without them. If
          you choose to sign in with Google or Apple, they set their own
          cookies on their own websites.
        </p>
        <p>
          Because we don’t track you across websites, there is nothing for a
          browser “Do Not Track” or Global Privacy Control signal to switch off.
        </p>
      </Section>

      <Section id="sharing" title="Who we share data with">
        <p>
          We don’t sell your personal data, and we don’t “share” it for
          cross-context behavioural advertising as defined by California law.
          We share it only with service providers (processors) that help us run
          Stubbed, under contracts that let them use it only on our instructions:
        </p>
        <List>
          <li>
            <strong>Supabase</strong>: database, sign-in and photo storage.
          </li>
          <li>
            <strong>Vercel</strong>: website hosting and visit statistics.
          </li>
          <li>
            <strong>Google</strong>: visit statistics for our public pages
            (Google Analytics, without cookies).
          </li>
          <li>
            <strong>Kit</strong>: keeps the waitlist and sends its emails.
          </li>
          <li>
            <strong>AI providers</strong>: reading photos and ticket emails, as
            described above. We use Anthropic (Claude) by default, and may use
            Google (Gemini), Groq or Cerebras instead. We use their paid
            business services, whose terms don’t allow them to use this data to
            train their models.
          </li>
          <li>
            <strong>Google</strong>: sign-in, only if you choose “Continue with
            Google”.
          </li>
          <li>
            <strong>Apple</strong>: sign-in, only if you choose “Continue with
            Apple”.
          </li>
          <li>
            <strong>OpenStreetMap services</strong>: nearby-theatre lookups, as
            described above, with no account details attached.
          </li>
        </List>
        <p>
          We may also disclose data if the law requires it, to protect the
          rights, safety or property of our users or others, or to a successor
          if Stubbed is ever transferred to someone else, in which case this
          policy will continue to apply to your data.
        </p>
      </Section>

      <Section id="transfers" title="International transfers">
        <p>
          Some of our providers are based in, or process data in, the United
          States and other countries outside the UK and the European Economic
          Area. When your data is transferred there, we rely on safeguards the
          law recognises: an adequacy decision (such as the EU–US Data Privacy
          Framework and its UK extension, where the provider is certified), or
          the European Commission’s Standard Contractual Clauses with the UK
          Addendum. Email us for a copy of the relevant safeguards.
        </p>
      </Section>

      <Section id="retention" title="How long we keep it">
        <List>
          <li>
            <strong>Waitlist</strong>: until we invite you or you ask to be
            removed, and in any case no more than 12 months after public launch.
          </li>
          <li>
            <strong>Account and diary</strong>: for as long as you have an
            account. When you delete your account or an entry, we delete it from
            the live service within 30 days; copies in backups are overwritten
            within a further 90 days.
          </li>
          <li>
            <strong>Usage statistics</strong> about your account: for as long
            as you have an account, and deleted with it.
          </li>
          <li>
            <strong>Technical logs</strong>: kept by our providers for a short
            period, typically no more than 30 days.
          </li>
          <li>
            <strong>Photo location, ticket email text and AI results</strong>:
            not stored by us. They’re used to make your drafts and then
            discarded.
          </li>
        </List>
        <p>
          We may keep a limited record for longer where the law requires it or
          to deal with a legal claim.
        </p>
      </Section>

      <Section id="rights" title="Your rights">
        <p>
          Wherever you live, you can ask us to:
        </p>
        <List>
          <li>give you a copy of your personal data, in a portable format (CSV);</li>
          <li>correct data that’s wrong;</li>
          <li>delete your data and your account;</li>
          <li>
            remove you from the waitlist or withdraw any consent you gave, which
            doesn’t affect what we did before.
          </li>
        </List>
        <p>
          <strong>In the UK and EU</strong> you also have the right to restrict
          or object to our use of your data (including where we rely on
          legitimate interests), and to complain to a data protection
          authority. In the UK that’s the{" "}
          <TextLink href="https://ico.org.uk/make-a-complaint/">
            Information Commissioner’s Office
          </TextLink>
          ; in the EU, it’s the authority in the country where you live or work.
          We’d appreciate the chance to sort things out first.
        </p>
        <p>
          <strong>In the US</strong>, residents of California and other states
          with privacy laws have the right to know what personal information we
          collect, use and disclose (described above), to access, correct and
          delete it, and to opt out of its sale, sharing for targeted
          advertising, or profiling. We don’t do any of those things. We won’t
          treat you differently for exercising your rights. You can use an
          authorised agent, and if we decline your request you can appeal by
          replying to our decision.
        </p>
        <p>
          To exercise any right, email <ContactEmail /> from the address on
          your account. We may ask you to confirm your identity. We’ll reply
          within one month (45 days in the US), and it’s free.
        </p>
      </Section>

      <Section id="security" title="Security">
        <p>
          Data is encrypted in transit and at rest. Database rules ensure that
          private entries can be read only by their owner. Photos are stored
          without their original metadata. No system is perfectly secure, but
          if a breach affects your data we’ll tell you and the regulators as the
          law requires.
        </p>
      </Section>

      <Section id="children" title="Children">
        <p>
          Stubbed is not for anyone under {LEGAL.minimumAge}. We don’t knowingly
          collect personal data from children under {LEGAL.minimumAge}, including
          children under 13 in the US. If you think a child has given us their
          data, email us and we’ll delete it.
        </p>
      </Section>

      <Section id="changes" title="Changes to this policy">
        <p>
          If we change this policy, we’ll update the date at the top. If the
          change is significant, we’ll also tell you by email or in the app
          before it takes effect.
        </p>
      </Section>

      <Section id="contact" title="Contact">
        <p>
          {operatorName()}. Email: <ContactEmail />.
        </p>
      </Section>
    </LegalPage>
  );
}

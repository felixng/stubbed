import type { Metadata, Viewport } from "next";

import {
  ContactEmail,
  LegalPage,
  List,
  Section,
  TextLink,
} from "@/components/legal/LegalPage";
import { LEGAL, operatorName } from "@/lib/legal";

// Consumer terms written to hold up in the UK (Consumer Rights Act 2015,
// Online Safety Act), the EU (consumer law, Digital Services Act notice and
// action) and the US (DMCA notice procedure, warranty and liability limits
// "to the extent permitted by law"). No payments or subscriptions: Stubbed
// is free, so there are no cancellation or refund terms yet.
export const metadata: Metadata = {
  title: "Terms of Service — Stubbed",
  description: "The rules for using Stubbed, the theatre diary.",
};

export const viewport: Viewport = { themeColor: "#f2f2f7" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <>
          <p>
            These terms are the agreement between you and {operatorName()}{" "}
            (“we”, “us”) for using the Stubbed website, app and
            related services (the “Service”). By joining the waitlist, creating
            an account or using the Service, you agree to them. If you don’t
            agree, please don’t use the Service.
          </p>
          <p>
            Our <TextLink href="/privacy">Privacy Policy</TextLink> explains how
            we handle your personal data. Nothing in these terms takes away
            rights you have by law as a consumer.
          </p>
        </>
      }
    >
      <Section id="eligibility" title="Who can use Stubbed">
        <p>
          You must be at least {LEGAL.minimumAge} years old and able to enter
          into a binding agreement. You use the Service for your own personal,
          non-commercial purposes. Stubbed is currently in private beta: we
          decide who gets an account, and features may change or be removed
          while we build it.
        </p>
      </Section>

      <Section id="account" title="Your account">
        <List>
          <li>Give accurate information and keep your sign-in details secure.</li>
          <li>
            You’re responsible for what happens under your account. Tell us
            straight away at <ContactEmail /> if you think someone else has
            access to it.
          </li>
          <li>
            Your handle must not impersonate anyone, mislead people about who
            you are, or infringe anyone’s rights. We may ask you to change a
            handle that does.
          </li>
        </List>
      </Section>

      <Section id="content" title="Your content">
        <p>
          You own what you add to Stubbed: your entries, ratings, notes, photos
          and trips (“your content”). To run the Service, you give us a
          worldwide, non-exclusive, royalty-free licence to host, store, copy,
          resize, display and distribute your content, only as needed to
          operate, improve and promote the Service in line with your visibility
          settings. For example, we can show your public entries on your profile
          and on share cards you create. This licence ends when you delete the
          content or your account, except for copies other people have already
          shared, and for backups for the limited time described in the Privacy
          Policy.
        </p>
        <p>
          Entries are public by default. You control the visibility of each
          entry and trip, and your default, in the app.
        </p>
        <p>
          Shows and venues you add to the shared catalogue are facts about the
          world, not personal content. You give us a perpetual licence to keep,
          correct, merge and display them for everyone, without your name
          attached, even if you leave.
        </p>
        <p>
          You can export your data at any time; see the Privacy Policy.
        </p>
      </Section>

      <Section id="rules" title="Rules for using Stubbed">
        <p>You agree not to post content or use the Service in a way that:</p>
        <List>
          <li>is illegal, or helps or encourages anything illegal;</li>
          <li>
            infringes anyone’s copyright, trademark, privacy or other rights,
            including photos you don’t have the right to share;
          </li>
          <li>
            harasses, threatens, bullies or discriminates against anyone, or is
            hateful, sexually explicit or violent;
          </li>
          <li>
            shares someone else’s personal information without their permission,
            or impersonates anyone;
          </li>
          <li>is spam, advertising, or misleading;</li>
          <li>
            tries to get around our security or privacy controls, access other
            people’s accounts or data, or overload or disrupt the Service;
          </li>
          <li>
            scrapes or copies the Service or the catalogue in bulk by automated
            means, except for search engines following our robots.txt.
          </li>
        </List>
        <p>
          Many theatres don’t allow photography during a performance. Respect
          the venue’s rules and the performers’ rights when you take and share
          photos.
        </p>
      </Section>

      <Section id="moderation" title="Reporting and moderation">
        <p>
          To report content you believe is illegal or breaks these terms,
          including under the EU Digital Services Act and the UK Online Safety
          Act, email <ContactEmail /> with a link to the content, why you think
          it’s a problem, your name and email, and a statement that your report
          is accurate and made in good faith. We’ll confirm we received it and
          review it promptly and fairly.
        </p>
        <p>
          We may remove or hide content, limit features, or suspend an account
          if we reasonably believe it breaks the law or these terms. Moderation
          decisions are made by a person, not automatically. Unless the law
          prevents it, we’ll tell you what we did and why, and you can ask us to
          review the decision by replying to that message. If you’re in the EU,
          you may also use a certified out-of-court dispute settlement body.
        </p>
        <p>
          Our single point of contact for users and for authorities, including
          under the Digital Services Act, is <ContactEmail />. We can
          correspond in English.
        </p>
      </Section>

      <Section id="copyright" title="Copyright complaints">
        <p>
          If you believe content on Stubbed infringes your copyright, email{" "}
          <ContactEmail /> with: your contact details; the copyrighted work;
          the link to the content you say infringes it; a statement that you
          have a good-faith belief the use isn’t authorised by the owner, its
          agent or the law; a statement, under penalty of perjury, that your
          notice is accurate and you’re the owner or authorised to act for them;
          and your physical or electronic signature. This is the notice the US
          Digital Millennium Copyright Act requires.
        </p>
        <p>
          If your content was removed and you believe that was a mistake, you
          can send us a counter-notice. We’ll suspend the accounts of people who
          repeatedly infringe others’ copyright.
        </p>
      </Section>

      <Section id="ours" title="Our content and the catalogue">
        <p>
          The Service, including its design, software, the Stubbed name and
          logo, and the catalogue as a whole, belongs to us or our licensors.
          You may use it only through the Service as these terms allow. Show
          titles, venue names and related marks belong to their owners; we use
          them only to identify what you saw. Venue data includes information
          from{" "}
          <TextLink href="https://www.openstreetmap.org/copyright">
            OpenStreetMap
          </TextLink>
          , © OpenStreetMap contributors, available under the Open Database
          Licence.
        </p>
      </Section>

      <Section id="suggestions" title="Automatic suggestions">
        <p>
          Stubbed can suggest the show and venue from a photo or a ticket
          email using AI and map data. Only import emails and photos that are
          yours to share. Suggestions can be wrong. Check them before you save; nothing is
          saved until you confirm it.
        </p>
      </Section>

      <Section id="third-party" title="Other services">
        <p>
          The Service links to and works with other services, such as Google
          and Apple sign-in and the apps you share to, like Instagram. Their own
          terms and privacy policies apply when you use them, and we aren’t
          responsible for them.
        </p>
      </Section>

      <Section id="price" title="Price">
        <p>
          Stubbed is free. If we ever introduce paid features, we’ll tell you
          the price and terms clearly before you buy anything, and you won’t be
          charged unless you choose to pay.
        </p>
      </Section>

      <Section id="ending" title="Ending your use of Stubbed">
        <p>
          You can stop using Stubbed and ask us to delete your account at any
          time by emailing <ContactEmail />.
        </p>
        <p>
          We may suspend or close your account if you seriously or repeatedly
          break these terms, if the law requires it, or to protect other users.
          Except in urgent cases, we’ll give you notice and a reason. If we
          decide to shut down the Service altogether, we’ll give you at least 30
          days’ notice so you can export your data.
        </p>
      </Section>

      <Section id="service" title="The Service as it is">
        <p>
          We work hard to keep Stubbed running, accurate and secure, but it’s a
          free service in beta. To the extent the law allows, we provide it “as
          is” and “as available”, without warranties of any kind, whether express
          or implied, including warranties of merchantability, fitness for a
          particular purpose and non-infringement. We don’t promise that it will
          always be available or error-free, or that the catalogue is complete
          or correct. Export your data regularly if it matters to you.
        </p>
        <p>
          If you’re a consumer in the UK or EU, you have legal rights in relation
          to digital content and services that are not as described, faulty or
          not supplied with reasonable care and skill. Nothing in these terms
          affects those rights.
        </p>
      </Section>

      <Section id="liability" title="Our responsibility to you">
        <p>
          Nothing in these terms limits or excludes our liability for death or
          personal injury caused by our negligence, for fraud or fraudulent
          misrepresentation, or for anything else that can’t be limited or
          excluded by law.
        </p>
        <p>
          <strong>If you’re in the UK or EU</strong>, we’re responsible for loss
          or damage you suffer that is a foreseeable result of our breaking
          these terms or failing to use reasonable care and skill. We aren’t
          responsible for loss or damage that isn’t foreseeable. Because the
          Service is for personal use, we aren’t responsible for any business
          losses.
        </p>
        <p>
          <strong>Everywhere else, including the US</strong>, to the maximum
          extent permitted by law, we won’t be liable for any indirect,
          incidental, special, consequential or punitive damages, or for lost
          profits, data or goodwill, and our total liability for all claims
          relating to the Service is limited to US$100. Some states don’t allow
          these limits, so they may not apply to you.
        </p>
      </Section>

      <Section id="changes" title="Changes to these terms">
        <p>
          We may update these terms as Stubbed grows, for example to reflect
          new features or changes in the law. We’ll update the date at the top
          and, for significant changes, tell you by email or in the app at least
          30 days before they take effect. If you don’t agree, you can delete
          your account before then. If you keep using Stubbed after the changes
          take effect, the new terms apply.
        </p>
      </Section>

      <Section id="law" title="Governing law and disputes">
        <p>
          These terms are governed by the law of {LEGAL.governingLaw}, and
          disputes go to {LEGAL.courts}. If you’re a consumer living elsewhere,
          you also keep the protection of the mandatory laws of the country or
          state where you live, and you can bring proceedings in your local
          courts. In Scotland or Northern Ireland, you can bring proceedings
          there.
        </p>
        <p>
          If you have a problem, please email us first. Most things can be
          sorted out quickly that way.
        </p>
      </Section>

      <Section id="general" title="The rest">
        <List>
          <li>
            If a court decides part of these terms can’t be enforced, the rest
            still applies.
          </li>
          <li>
            If we don’t enforce a term straight away, we can still enforce it
            later.
          </li>
          <li>
            We may transfer this agreement to someone who takes over Stubbed;
            your rights under it won’t be reduced. You may not transfer it.
          </li>
          <li>
            These terms and the Privacy Policy are the whole agreement between
            us about the Service. Nobody else has rights under them.
          </li>
        </List>
      </Section>

      <Section id="contact" title="Contact">
        <p>
          {operatorName()}. Email: <ContactEmail />.
        </p>
      </Section>
    </LegalPage>
  );
}

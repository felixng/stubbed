import { getCopy } from "@/lib/cms/content";
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
export async function generateMetadata(): Promise<Metadata> {
  const copy = await getCopy("termsMeta");
  return { title: copy.seoTitle, description: copy.description,
    openGraph: { title: copy.seoTitle, description: copy.description, url: "/terms" },
  };
}

export const viewport: Viewport = { themeColor: "#f2f2f7" };

export default async function TermsPage() {
  const [copy, pageCopy] = await Promise.all([getCopy("terms"), getCopy("termsMeta")]);
  return (
    <LegalPage
      title={pageCopy.title}
      updated={pageCopy.updated}
      intro={
        <>
          <p>
            {copy.theseTermsAreTheAgreementBetween}{operatorName()}{" "}
            {copy.weUsForUsingTheStubbed}
          </p>
          <p>
            {copy.our}<TextLink href="/privacy">{copy.privacyPolicy}</TextLink> {copy.explainsHowWeHandleYourPersonal}</p>
        </>
      }
    >
      <Section id="eligibility" title={copy.whoCanUseStubbed}>
        <p>
          {copy.youMustBeAtLeast}{LEGAL.minimumAge} {copy.yearsOldAndAbleToEnter}</p>
      </Section>

      <Section id="account" title={copy.yourAccount}>
        <List>
          <li>{copy.giveAccurateInformationAndKeepYour}</li>
          <li>
            {copy.youreResponsibleForWhatHappensUnder}<ContactEmail /> {copy.ifYouThinkSomeoneElseHas}</li>
          <li>
            {copy.yourHandleMustNotImpersonateAnyone}
          </li>
        </List>
      </Section>

      <Section id="content" title={copy.yourContent}>
        <p>
          {copy.youOwnWhatYouAddTo}
        </p>
        <p>
          {copy.entriesArePublicByDefaultYou}
        </p>
        <p>
          {copy.showsAndVenuesYouAddTo}
        </p>
        <p>
          {copy.youCanExportYourDataAt}
        </p>
      </Section>

      <Section id="rules" title={copy.rulesForUsingStubbed}>
        <p>{copy.youAgreeNotToPostContent}</p>
        <List>
          <li>{copy.isIllegalOrHelpsOrEncourages}</li>
          <li>
            {copy.infringesAnyonesCopyrightTrademarkPrivacyOr}
          </li>
          <li>
            {copy.harassesThreatensBulliesOrDiscriminatesAgainst}
          </li>
          <li>
            {copy.sharesSomeoneElsesPersonalInformationWithout}
          </li>
          <li>{copy.isSpamAdvertisingOrMisleading}</li>
          <li>
            {copy.triesToGetAroundOurSecurity}
          </li>
          <li>
            {copy.scrapesOrCopiesTheServiceOr}
          </li>
        </List>
        <p>
          {copy.manyTheatresDontAllowPhotographyDuring}
        </p>
      </Section>

      <Section id="moderation" title={copy.reportingAndModeration}>
        <p>
          {copy.toReportContentYouBelieveIs}<ContactEmail /> {copy.withALinkToTheContent}</p>
        <p>
          {copy.weMayRemoveOrHideContent}
        </p>
        <p>
          {copy.ourSinglePointOfContactFor}<ContactEmail />{copy.weCanCorrespondInEnglish}</p>
      </Section>

      <Section id="copyright" title={copy.copyrightComplaints}>
        <p>
          {copy.ifYouBelieveContentOnStubbed}{" "}
          <ContactEmail /> {copy.withYourContactDetailsTheCopyrighted}</p>
        <p>
          {copy.ifYourContentWasRemovedAnd}
        </p>
      </Section>

      <Section id="ours" title={copy.ourContentAndTheCatalogue}>
        <p>
          {copy.theServiceIncludingItsDesignSoftware}{" "}
          <TextLink href="https://www.openstreetmap.org/copyright">
            {copy.openstreetmap}
          </TextLink>
          {copy.openstreetmapContributorsAvailableUnderTheOpen}
        </p>
      </Section>

      <Section id="suggestions" title={copy.automaticSuggestions}>
        <p>
          {copy.stubbedCanSuggestAVenueFrom}
        </p>
      </Section>

      <Section id="third-party" title={copy.otherServices}>
        <p>
          {copy.theServiceLinksToAndWorks}
        </p>
      </Section>

      <Section id="price" title={copy.price}>
        <p>
          {copy.stubbedIsFreeIfWeEver}
        </p>
      </Section>

      <Section id="ending" title={copy.endingYourUseOfStubbed}>
        <p>
          {copy.youCanStopUsingStubbedAnd}<ContactEmail />.
        </p>
        <p>
          {copy.weMaySuspendOrCloseYour}
        </p>
      </Section>

      <Section id="service" title={copy.theServiceAsItIs}>
        <p>
          {copy.weWorkHardToKeepStubbed}
        </p>
        <p>
          {copy.ifYoureAConsumerInThe}
        </p>
      </Section>

      <Section id="liability" title={copy.ourResponsibilityToYou}>
        <p>
          {copy.nothingInTheseTermsLimitsOr}
        </p>
        <p>
          <strong>{copy.ifYoureInTheUKOr}</strong>{copy.wereResponsibleForLossOrDamage}</p>
        <p>
          <strong>{copy.everywhereElseIncludingTheUS}</strong>{copy.toTheMaximumExtentPermittedBy}</p>
      </Section>

      <Section id="changes" title={copy.changesToTheseTerms}>
        <p>
          {copy.weMayUpdateTheseTermsAs}
        </p>
      </Section>

      <Section id="law" title={copy.governingLawAndDisputes}>
        <p>
          {copy.theseTermsAreGovernedByThe}{LEGAL.governingLaw}{copy.andDisputesGoTo}{LEGAL.courts}{copy.ifYoureAConsumerLivingElsewhere}</p>
        <p>
          {copy.ifYouHaveAProblemPlease}
        </p>
      </Section>

      <Section id="general" title={copy.theRest}>
        <List>
          <li>
            {copy.ifACourtDecidesPartOf}
          </li>
          <li>
            {copy.ifWeDontEnforceATerm}
          </li>
          <li>
            {copy.weMayTransferThisAgreementTo}
          </li>
          <li>
            {copy.theseTermsAndThePrivacyPolicy}
          </li>
        </List>
      </Section>

      <Section id="contact" title={copy.contact}>
        <p>
          {operatorName()}{copy.email}<ContactEmail />.
        </p>
      </Section>
    </LegalPage>
  );
}

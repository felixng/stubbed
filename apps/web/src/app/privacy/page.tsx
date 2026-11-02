import { getCopy } from "@/lib/cms/content";
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
export async function generateMetadata(): Promise<Metadata> {
  const copy = await getCopy("privacyMeta");
  return { title: copy.seoTitle, description: copy.description,
    openGraph: { title: copy.seoTitle, description: copy.description, url: "/privacy" },
  };
}

export const viewport: Viewport = { themeColor: "#f2f2f7" };

export default async function PrivacyPage() {
  const [copy, pageCopy] = await Promise.all([getCopy("privacy"), getCopy("privacyMeta")]);
  return (
    <LegalPage
      title={pageCopy.title}
      updated={pageCopy.updated}
      intro={
        <>
          <p>
            {copy.stubbedIsATheatreDiaryYou}
          </p>
          <p>
            {copy.theShortVersionWeCollectOnly}
          </p>
        </>
      }
    >
      <Section id="who" title={copy.whoWeAre}>
        <p>
          {operatorName()} {copy.weUsIsTheControllerOf}</p>
        <p>
          {copy.forAnythingAboutPrivacyIncludingExercising}{" "}
          <ContactEmail />{copy.weDontHaveADataProtection}</p>
      </Section>

      <Section id="collect" title={copy.whatWeCollectAndWhy}>
        <p>
          {copy.forEachKindOfDataBelow}
        </p>

        <SubHeading>{copy.waitlist}</SubHeading>
        <List>
          <li>
            <strong>{copy.yourEmailAddress}</strong>{copy.soWeCanInviteYouWhen}</li>
          <li>
            <strong>{copy.whereYouCameFrom}</strong> {copy.aCampaignTagOrTheReferring}</li>
        </List>

        <SubHeading>{copy.yourAccount}</SubHeading>
        <List>
          <li>
            <strong>{copy.emailAddressAndPassword}</strong> {copy.passwordsAreStoredOnlyAsA}</li>
          <li>
            <strong>{copy.ifYouSignInWithGoogle}</strong>{copy.googleSharesYourNameEmailAddress}</li>
          <li>
            <strong>{copy.ifYouSignInWithApple}</strong>{copy.appleSharesYourNameAndEmail}</li>
          <li>
            <strong>{copy.yourProfile}</strong>{copy.handleDisplayNameAvatarBioA}</li>
        </List>
        <p>
          {copy.legalBasisPerformingOurContractWith}{" "}
          <TextLink href="/terms">{copy.terms}</TextLink>{copy.sinceWeCantGiveYouAn}</p>

        <SubHeading>{copy.yourDiary}</SubHeading>
        <List>
          <li>
            <strong>{copy.entries}</strong>{copy.theShowVenueAndDateAnd}</li>
          <li>
            <strong>{copy.tripsAndLabels}</strong> {copy.youCreateAndTheEntriesIn}</li>
          <li>
            <strong>{copy.showsAndVenuesYouAdd}</strong> {copy.toTheSharedCatalogueTheseAre}</li>
        </List>
        <p>
          {copy.legalBasisPerformingOurContractWith2}
        </p>

        <SubHeading>{copy.photosAndNearbyTheatres}</SubHeading>
        <p>
          {copy.whenYouAddAPhotoTo}
        </p>
        <p>
          {copy.toSuggestTheVenueForYou}
        </p>
        <p>
          {copy.suggestionsAreOnlySuggestionsNothingIs}
        </p>

        <SubHeading>{copy.technicalData}</SubHeading>
        <p>
          {copy.likeAnyWebsiteOurHostingAnd}
        </p>

        <SubHeading>{copy.usageStatistics}</SubHeading>
        <p>
          {copy.toLearnWhatWorksAndWhat}
        </p>
        <List>
          <li>
            <strong>{copy.visitsToOurPublicPages}</strong> {copy.theHomePageTheseLegalPages}</li>
          <li>
            <strong>{copy.someThingsYouDoInYour}</strong>{copy.whenYouAddANewShow}</li>
        </List>
        <p>
          {copy.legalBasisOurLegitimateInterestIn}
        </p>
      </Section>

      <Section id="public" title={copy.whatOtherPeopleCanSee}>
        <p>
          {copy.yourHandleDisplayNameAvatarBio}<strong>{copy.publicByDefault}</strong>{copy.anyoneIncludingPeopleWithoutAnAccount}</p>
        <p>
          {copy.ifYouShareACardOr}
        </p>
      </Section>

      <Section id="cookies" title={copy.cookies}>
        <p>
          {copy.weUseOnlyCookiesThatAre}
        </p>
        <p>
          {copy.becauseWeDontTrackYouAcross}
        </p>
      </Section>

      <Section id="sharing" title={copy.whoWeShareDataWith}>
        <p>
          {copy.weDontSellYourPersonalData}
        </p>
        <List>
          <li>
            <strong>{copy.supabase}</strong>{copy.databaseSigninAndPhotoStorage}</li>
          <li>
            <strong>{copy.vercel}</strong>{copy.websiteHostingAndVisitStatistics}</li>
          <li>
            <strong>{copy.google}</strong>{copy.visitStatisticsForOurPublicPages}</li>
          <li>
            <strong>{copy.kit}</strong>{copy.keepsTheWaitlistAndSendsIts}</li>
          <li>
            <strong>{copy.google2}</strong>{copy.signinOnlyIfYouChooseContinue}</li>
          <li>
            <strong>{copy.apple}</strong>{copy.signinOnlyIfYouChooseContinue2}</li>
          <li>
            <strong>{copy.openstreetmapServices}</strong>{copy.nearbytheatreLookupsAsDescribedAboveWith}</li>
        </List>
        <p>
          {copy.weMayAlsoDiscloseDataIf}
        </p>
      </Section>

      <Section id="transfers" title={copy.internationalTransfers}>
        <p>
          {copy.someOfOurProvidersAreBased}
        </p>
      </Section>

      <Section id="retention" title={copy.howLongWeKeepIt}>
        <List>
          <li>
            <strong>{copy.waitlist2}</strong>{copy.untilWeInviteYouOrYou}</li>
          <li>
            <strong>{copy.accountAndDiary}</strong>{copy.forAsLongAsYouHave}</li>
          <li>
            <strong>{copy.usageStatistics2}</strong> {copy.aboutYourAccountForAsLong}</li>
          <li>
            <strong>{copy.technicalLogs}</strong>{copy.keptByOurProvidersForA}</li>
          <li>
            <strong>{copy.photoLocation}</strong>{copy.notStoredByUsItsUsed}</li>
        </List>
        <p>
          {copy.weMayKeepALimitedRecord}
        </p>
      </Section>

      <Section id="rights" title={copy.yourRights}>
        <p>
          {copy.whereverYouLiveYouCanAsk}
        </p>
        <List>
          <li>{copy.giveYouACopyOfYour}</li>
          <li>{copy.correctDataThatsWrong}</li>
          <li>{copy.deleteYourDataAndYourAccount}</li>
          <li>
            {copy.removeYouFromTheWaitlistOr}
          </li>
        </List>
        <p>
          <strong>{copy.inTheUKAndEU}</strong> {copy.youAlsoHaveTheRightTo}{" "}
          <TextLink href="https://ico.org.uk/make-a-complaint/">
            {copy.informationCommissionersOffice}
          </TextLink>
          {copy.inTheEUItsTheAuthority}
        </p>
        <p>
          <strong>{copy.inTheUS}</strong>{copy.residentsOfCaliforniaAndOtherStates}</p>
        <p>
          {copy.toExerciseAnyRightEmail}<ContactEmail /> {copy.fromTheAddressOnYourAccount}</p>
      </Section>

      <Section id="security" title={copy.security}>
        <p>
          {copy.dataIsEncryptedInTransitAnd}
        </p>
      </Section>

      <Section id="children" title={copy.children}>
        <p>
          {copy.stubbedIsNotForAnyoneUnder}{LEGAL.minimumAge}{copy.weDontKnowinglyCollectPersonalData}{LEGAL.minimumAge}{copy.includingChildrenUnder13InThe}</p>
      </Section>

      <Section id="changes" title={copy.changesToThisPolicy}>
        <p>
          {copy.ifWeChangeThisPolicyWell}
        </p>
      </Section>

      <Section id="contact" title={copy.contact}>
        <p>
          {operatorName()}{copy.email}<ContactEmail />.
        </p>
      </Section>
    </LegalPage>
  );
}

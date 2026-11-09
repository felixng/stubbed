import Foundation
import Testing
import Supabase
import UIKit

@testable import Stubbed

private enum PostgrestErrorStub {
  static func make(_ message: String) -> Error { PostgrestError(code: "42501", message: message) }
}

@MainActor
struct PaywallTests {
  private func decode(_ locked: [String]?, types: Bool = false) throws -> InsightStats {
    let access = locked.map { "\"access\":{\"tier\":\"free\",\"period\":\"current\",\"locked\":\($0.isEmpty ? "[]" : "[\"" + $0.joined(separator: "\",\"") + "\"]")}" }
    let json = """
      {"total":4,"unique_shows":3,"repeated_shows":[],"unlocated":0,
       "streaks":{"current_daily":0,"longest_daily":2,"current_weekly":1,"longest_weekly":2},
       "years":[],"months":[],"days":[],
       "types":\(types ? "[{\"type\":\"musical\",\"count\":4}]" : "[]"),"countries":[]\(access.map { "," + $0 } ?? "")}
      """
    return try JSONDecoder().decode(InsightStats.self, from: Data(json.utf8))
  }

  // MARK: lock derivation

  @Test func oldResponsesWithoutAccessDecodeAndLockNothing() throws {
    let stats = try decode(nil, types: true)
    #expect(stats.access == nil)
    #expect(!stats.isLocked("types"))
    #expect(InsightCardDesign.mix.isLocked(by: stats) == false)
  }

  @Test func accessLockedDrivesFieldsAndCards() throws {
    let stats = try decode(["years", "types"])
    #expect(stats.isLocked("types"))
    #expect(stats.isLocked("years"))
    #expect(!stats.isLocked("total"))
    #expect(InsightCardDesign.mix.isLocked(by: stats))
    #expect(InsightCardDesign.history.isLocked(by: stats))
    // This year's overview and the current streaks stay free.
    #expect(!InsightCardDesign.year.isLocked(by: stats))
    #expect(!InsightCardDesign.weekly.isLocked(by: stats))
    // A locked design is offered, as a lock, in place of a missing card.
    #expect(InsightCardDesign.available(stats, year: 2026, currentYear: 2026).contains(.mix))
    #expect(InsightCardDesign.available(stats, year: 2026, currentYear: 2026).contains(.history))
  }

  @Test func lockedCardsComeFromSampleNumbersNeverTheUsersStats() throws {
    let stats = try decode(["types"])
    let data = InsightCardData(stats: stats, year: 2026, handle: "me", currentYear: 2026)
    let cards = try ShareCards.insightsCards(data, includingEmpty: true, designs: [.weekly, .mix])
    #expect(cards.first { $0.id == "show-mix" }?.isLocked == true)
    #expect(cards.first { $0.id == "show-mix" }?.supportsBackground == false)
    #expect(cards.first { $0.id == "weekly-streak" }?.isLocked == false)
    #expect(cards.first { $0.id == "show-mix" }?.paywallSource == .showMix)
  }

  // MARK: policy

  @Test func canUseFollowsGatesMembershipAndPolicy() {
    let membership = Membership()
    let policy = ["insights.show_mix": "pro", "insights.current_year": "free"]
    #expect(membership.canUse("insights.show_mix"))  // not loaded yet: the database enforces it
    membership.apply(info: .free, config: ProConfig(salesEnabled: true, gatesEnabled: false), featureTiers: policy)
    #expect(membership.canUse("insights.show_mix"))  // gates off: everything is free
    membership.apply(info: .free, config: ProConfig(salesEnabled: true, gatesEnabled: true), featureTiers: policy)
    #expect(!membership.canUse("insights.show_mix"))
    #expect(membership.canUse("insights.current_year"))
    // One policy: making Show mix free unlocks it everywhere.
    membership.apply(info: .free, config: ProConfig(salesEnabled: true, gatesEnabled: true),
      featureTiers: ["insights.show_mix": "free"])
    #expect(membership.canUse("insights.show_mix"))
  }

  @Test func configFromRowsDefaultsToOff() {
    #expect(ProConfig(rows: [:]) == ProConfig())
    let config = ProConfig(rows: ["pro_display_name": "Plus", "paywall_sales_enabled": "true"])
    #expect(config.displayName == "Plus")
    #expect(config.salesEnabled)
    #expect(!config.gatesEnabled)
  }

  @Test func membershipClearsOnSignOut() async {
    let membership = Membership()
    membership.apply(
      info: MembershipInfo(tier: "pro", source: "subscription", expires_at: nil, will_renew: true, is_trial: false, manage: []),
      config: ProConfig(salesEnabled: true, gatesEnabled: true), featureTiers: ["insights.show_mix": "pro"])
    #expect(membership.isPro)
    let before = membership.version
    await membership.reload(for: nil)
    #expect(membership.info == nil)
    #expect(membership.config == ProConfig())
    #expect(membership.featureTiers.isEmpty)
    #expect(membership.version > before)
  }

  // MARK: the one paywall

  @Test func paywallResumesOnlyAfterConfirmedUpgrade() {
    let router = PaywallRouter()
    var resumed = 0
    router.present(source: .pastYear) { resumed += 1 }
    #expect(router.request?.source == .pastYear)
    router.membershipChanged(isPro: false)
    #expect(router.request != nil && resumed == 0)
    router.membershipChanged(isPro: true)
    #expect(router.request == nil)
    #expect(resumed == 1)
    router.membershipChanged(isPro: true)
    #expect(resumed == 1)
  }

  @Test func dismissingForgetsTheDestination() {
    let router = PaywallRouter()
    var resumed = 0
    router.present(source: .showMix) { resumed += 1 }
    router.dismiss()
    router.membershipChanged(isPro: true)
    #expect(resumed == 0)
  }

  @Test func onlyTheInnermostHostPresents() {
    let router = PaywallRouter()
    let root = UUID(), sheet = UUID()
    router.register(root)
    router.register(sheet)
    #expect(router.activeHost == sheet)
    router.unregister(sheet)
    #expect(router.activeHost == root)
  }

  @Test func theDefaultOfferIsUnavailable() async {
    let router = PaywallRouter()
    await router.loadOffer()
    #expect(!router.offer.isAvailable)
    #expect(!router.offer.trialEligible)
  }

  @Test func upgradeRequiredIsRecognised() {
    #expect(Insights.isUpgradeRequired(PostgrestErrorStub.make("upgrade_required:insights.show_mix")))
    #expect(!Insights.isUpgradeRequired(PostgrestErrorStub.make("something else")))
  }
}

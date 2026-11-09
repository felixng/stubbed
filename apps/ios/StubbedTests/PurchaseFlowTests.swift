import Foundation
import Testing

@testable import Stubbed

/// A purchasing client that records what the flow asks of it.
private actor MockPurchases: PurchasesClient {
  var outcome: PurchaseOutcome = .purchased
  var failPurchase = false
  var calls: [String] = []
  var packagesToOffer: [PurchasePackage] = []

  func set(outcome: PurchaseOutcome) { self.outcome = outcome }
  func set(packages: [PurchasePackage]) { packagesToOffer = packages }
  func setFailPurchase() { failPurchase = true }

  func identify(_ userId: UUID) async throws { calls.append("identify:\(userId.uuidString.prefix(4))") }
  func reset() async throws { calls.append("reset") }
  func packages() async throws -> [PurchasePackage] { packagesToOffer }
  func purchase(_ packageId: String) async throws -> PurchaseOutcome {
    calls.append("purchase:\(packageId)")
    if failPurchase { throw URLError(.notConnectedToInternet) }
    return outcome
  }
  func restore() async throws { calls.append("restore") }
}

@MainActor
private final class Server {
  /// Polls before the membership says Pro; nil means never.
  var proAfter: Int?
  var polls = 0
  var refreshes = 0
  func confirm() async -> Bool {
    polls += 1
    guard let proAfter else { return false }
    return polls > proAfter
  }
}

@MainActor
struct PurchaseFlowTests {
  private func make(_ client: MockPurchases, _ server: Server, limit: Duration = .seconds(30)) -> PurchaseFlow {
    PurchaseFlow(
      client: client,
      refresh: { await MainActor.run { server.refreshes += 1 } },
      confirmPro: { await server.confirm() },
      sleep: { _ in },
      waitLimit: limit)
  }

  private let month = PurchasePackage(id: "$rc_monthly", title: "Monthly", price: "£2.99", period: "month", trial: "30-day")
  private let year = PurchasePackage(id: "$rc_annual", title: "Annual", price: "£19.99", period: "year", trial: "30-day")

  @Test func purchaseConfirmsThenIsPro() async {
    let client = MockPurchases(), server = Server()
    server.proAfter = 2
    let flow = make(client, server)
    await flow.buy("$rc_annual", source: .showMix)
    #expect(flow.state == .idle)  // confirmed: the router closes the paywall on Pro
    #expect(server.refreshes == 1)
    #expect(server.polls == 3)
    #expect(await client.calls == ["purchase:$rc_annual"])
  }

  @Test func sdkSuccessAloneNeverMeansPro() async {
    let client = MockPurchases(), server = Server()  // the server never says Pro
    let flow = make(client, server)
    await flow.buy("$rc_monthly", source: .profile)
    #expect(flow.state == .timedOut)
  }

  @Test func timeoutThenRetryLooksAgainWithoutBuyingAgain() async {
    let client = MockPurchases(), server = Server()
    let flow = make(client, server)
    await flow.buy("$rc_monthly", source: .profile)
    #expect(flow.state == .timedOut)
    server.proAfter = server.polls  // the webhook lands
    await flow.retry()
    #expect(flow.state == .idle)
    #expect(await client.calls == ["purchase:$rc_monthly"])  // one purchase, ever
  }

  @Test func cancellingGoesBackQuietly() async {
    let client = MockPurchases(), server = Server()
    await client.set(outcome: .cancelled)
    let flow = make(client, server)
    await flow.buy("$rc_monthly", source: .pastYear)
    #expect(flow.state == .idle)
    #expect(server.refreshes == 0)
  }

  @Test func askToBuyExplainsAndDoesNotConfirm() async {
    let client = MockPurchases(), server = Server()
    await client.set(outcome: .pending)
    let flow = make(client, server)
    await flow.buy("$rc_monthly", source: .allTime)
    #expect(flow.state == .pendingApproval)
    #expect(server.polls == 0)
  }

  @Test func aFailedPurchaseSaysSoAndIsNotConfirmed() async {
    let client = MockPurchases(), server = Server()
    await client.setFailPurchase()
    let flow = make(client, server)
    await flow.buy("$rc_monthly", source: .profile)
    guard case .failed = flow.state else { Issue.record("expected a failure"); return }
    #expect(server.polls == 0)
  }

  @Test func restoreGoesThroughTheSameRefresh() async {
    let client = MockPurchases(), server = Server()
    server.proAfter = 0
    let flow = make(client, server)
    await flow.restore(source: .profile)
    #expect(flow.state == .idle)
    #expect(server.refreshes == 1)
    #expect(await client.calls == ["restore"])
  }

  @Test func accountSwitchLogsInThenOutAndClearsState() async {
    let client = MockPurchases(), server = Server()
    let flow = make(client, server)
    await flow.buy("$rc_monthly", source: .profile)
    #expect(flow.state == .timedOut)
    await flow.accountChanged(nil)  // the initial signed-out state touches nothing
    #expect(flow.state == .timedOut)
    await flow.accountChanged(UUID(uuidString: "aaaaaaaa-0000-0000-0000-000000000000"))
    await flow.accountChanged(nil)
    #expect(flow.state == .idle)
    #expect(await client.calls.suffix(2) == ["identify:AAAA", "reset"])

    let membership = Membership()
    membership.apply(
      info: MembershipInfo(tier: "pro", source: "subscription", expires_at: nil, will_renew: true, is_trial: false, manage: ["app_store"]),
      config: ProConfig(salesEnabled: true, gatesEnabled: true), featureTiers: [:])
    await membership.reload(for: nil)
    #expect(membership.info == nil && !membership.isPro)  // Pro never carries to the next account
  }

  @Test func aWebSubscriberIsProAndIsNotOfferedAPurchase() {
    let membership = Membership()
    membership.apply(
      info: MembershipInfo(tier: "pro", source: "subscription", expires_at: nil, will_renew: true, is_trial: false, manage: ["web"]),
      config: ProConfig(salesEnabled: true, gatesEnabled: true), featureTiers: [:])
    #expect(membership.isPro)
    #expect(!membership.isFree)  // so no upgrade banner; the paywall shows Manage, not a buy button
    #expect(membership.info?.manage == ["web"])
  }

  @Test func offerFromPackagesUsesProviderWording() async {
    let client = MockPurchases()
    await client.set(packages: [month, year])
    let offer = await RevenueCatOfferProvider(client: client).loadOffer()
    #expect(offer.plans.map(\.price) == ["£2.99 / month", "£19.99 / year"])
    #expect(offer.trialEligible)
    #expect(offer.terms?.hasPrefix("30-day free trial, then £2.99 / month or £19.99 / year") == true)

    let notEligible = PurchasePackage(id: "$rc_monthly", title: "Monthly", price: "£2.99", period: "month", trial: nil)
    await client.set(packages: [notEligible])
    let plain = await RevenueCatOfferProvider(client: client).loadOffer()
    #expect(!plain.trialEligible)
    #expect(plain.terms?.contains("trial") == false)
  }

  @Test func noKeyMeansNoPurchasingAtAll() async {
    let config = AppConfig(info: [
      "SupabaseURL": "https://example.supabase.co", "SupabasePublishableKey": "sb_publishable_test",
      "WebURL": "https://example.com", "RevenueCatIOSAPIKey": "",
    ])
    #expect(config.revenueCatKey == nil)
    let router = Billing.makeRouter(config: config, membership: Membership(), session: AppSession())
    #expect(!router.flow.isAvailable)
    await router.loadOffer()
    #expect(!router.offer.isAvailable)  // "Upgrades aren't available yet"
    await router.flow.accountChanged(UUID())  // and nothing is configured or crashes
    #expect(router.flow.state == .idle)
  }
}

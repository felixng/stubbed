import Foundation
import Observation

/// What the paywall offers. Prices, periods and trial terms always come from the provider at
/// runtime (docs/PAYWALL.md section 7), never from code.
struct PaywallOffer: Equatable, Sendable {
  struct Plan: Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    /// Localised price and period, e.g. "£19.99 / year".
    let price: String
  }
  var plans: [Plan] = []
  /// True only when the provider says this user can start a trial.
  var trialEligible = false
  /// Price, billing period and renewal or trial terms, as the provider words them.
  var terms: String?
  var isAvailable: Bool { !plans.isEmpty }
  static let unavailable = PaywallOffer()
}

/// Where plans come from: RevenueCat's offering when a key is configured, otherwise nothing.
protocol OfferProvider: Sendable {
  func loadOffer() async -> PaywallOffer
}

/// Until billing is configured: "Upgrades aren't available yet".
struct UnavailableOfferProvider: OfferProvider {
  func loadOffer() async -> PaywallOffer { .unavailable }
}

/// The one paywall (docs/PAYWALL.md section 7). Anything locked opens it through `present`,
/// which remembers where to go back to; once membership says Pro the sheet closes and that
/// destination is restored. Each sheet-hosting screen registers as a host, and only the
/// innermost one presents, so the paywall opens over a Share sheet as well as over the tabs.
@MainActor @Observable
final class PaywallRouter {
  enum Source: String, Sendable {
    case profile
    case showMix = "show_mix"
    case pastYear = "past_year"
    case allTime = "all_time"
  }
  struct Request: Identifiable {
    let id = UUID()
    let source: Source
  }

  var request: Request?
  private(set) var offer = PaywallOffer.unavailable
  private(set) var hosts: [UUID] = []
  private var resume: (@MainActor () -> Void)?
  private let provider: any OfferProvider
  /// Buying, restoring and confirming. Has no client (and so no buttons) until a key is set.
  let flow: PurchaseFlow

  init(provider: any OfferProvider = UnavailableOfferProvider(), flow: PurchaseFlow = PurchaseFlow(client: nil)) {
    self.provider = provider
    self.flow = flow
  }

  var activeHost: UUID? { hosts.last }

  func register(_ id: UUID) { if !hosts.contains(id) { hosts.append(id) } }
  func unregister(_ id: UUID) { hosts.removeAll { $0 == id } }

  func loadOffer() async { offer = await provider.loadOffer() }

  /// Opens the paywall; `resume` runs after a confirmed upgrade to put the user back.
  func present(source: Source, resume: (@MainActor () -> Void)? = nil) {
    self.resume = resume
    request = Request(source: source)
  }

  func dismiss() {
    request = nil
    resume = nil
    if !flow.isBusy { flow.reset() }
  }

  /// Membership changed: after a confirmed upgrade, close the paywall and go back.
  func membershipChanged(isPro: Bool) {
    guard isPro, request != nil else { return }
    let go = resume
    dismiss()
    go?()
  }
}

/// Builds the paywall's purchasing side. No key, no client: the paywall says upgrades aren't
/// available yet and the SDK is never configured.
@MainActor
enum Billing {
  static func makeRouter(
    config: AppConfig = .current, membership: Membership, session: AppSession
  ) -> PaywallRouter {
    let confirm: @MainActor () async -> Bool = {
      await membership.reload(for: session.userId)
      return membership.isPro
    }
    #if DEBUG
      if let preview = PaywallOfferPreview.mode { return preview.router(confirm: confirm) }
    #endif
    guard let key = config.revenueCatKey else { return PaywallRouter() }
    let client = RevenueCatPurchasesClient(apiKey: key)
    return PaywallRouter(
      provider: RevenueCatOfferProvider(client: client),
      flow: PurchaseFlow(client: client, confirmPro: confirm))
  }
}

extension PurchaseFlow {
  /// Follows the signed-in account: logs the SDK in as them, or out on sign-out, then asks
  /// the server to re-read their subscriptions (sign-in and foreground refresh).
  func accountChanged(_ userId: UUID?) async {
    guard let client else { return }
    let previous = identified
    identified = userId
    do {
      if let userId {
        if let previous, previous != userId { reset() }  // nothing carries across accounts
        try await client.identify(userId)
        await refreshFromServer()
      } else if previous != nil {
        reset()
        try await client.reset()
      }
    } catch {
      Log.data.warning("Purchases identity change failed: \(error.localizedDescription, privacy: .public)")
    }
  }
}

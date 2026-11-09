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

/// Where plans come from. #467 adds the RevenueCat one.
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

  init(provider: any OfferProvider = UnavailableOfferProvider()) { self.provider = provider }

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
  }

  /// Membership changed: after a confirmed upgrade, close the paywall and go back.
  func membershipChanged(isPro: Bool) {
    guard isPro, request != nil else { return }
    let go = resume
    dismiss()
    go?()
  }
}

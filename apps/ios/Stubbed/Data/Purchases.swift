import Foundation
import Observation
import Supabase

/// One purchasable plan as the store describes it. Everything shown to people (price, period,
/// trial wording) comes from here at runtime, never from code (docs/PAYWALL.md section 7).
struct PurchasePackage: Equatable, Identifiable, Sendable {
  let id: String
  let title: String
  /// Localised price, e.g. "£19.99".
  let price: String
  /// "month" or "year" and so on.
  let period: String
  /// The trial this user would get, e.g. "30 days", only when they're eligible.
  let trial: String?
}

enum PurchaseOutcome: Equatable, Sendable {
  case purchased
  case cancelled
  /// Ask to Buy or another deferral: nothing is paid until it's approved.
  case pending
}

/// The purchasing SDK behind a protocol, so tests and DEBUG previews never touch it.
/// The Pro launch epic supplies the real key; with none, there's no client at all.
protocol PurchasesClient: Sendable {
  /// Signs the SDK in as this Stubbed user, so a purchase belongs to the account.
  func identify(_ userId: UUID) async throws
  /// Signs out of the SDK; Pro never carries across accounts.
  func reset() async throws
  /// The `default` offering's monthly and annual packages.
  func packages() async throws -> [PurchasePackage]
  func purchase(_ packageId: String) async throws -> PurchaseOutcome
  func restore() async throws
}

/// Plans for the paywall from the purchasing SDK.
struct RevenueCatOfferProvider: OfferProvider {
  let client: any PurchasesClient

  func loadOffer() async -> PaywallOffer {
    do {
      let packages = try await client.packages()
      guard !packages.isEmpty else { return .unavailable }
      return PaywallOffer(
        plans: packages.map { .init(id: $0.id, title: $0.title, price: "\($0.price) / \($0.period)") },
        trialEligible: packages.contains { $0.trial != nil },
        terms: Self.terms(packages))
    } catch {
      Log.data.warning("Loading the offering failed: \(error.localizedDescription, privacy: .public)")
      return .unavailable
    }
  }

  /// "30-day free trial, then £2.99 / month or £19.99 / year. Renews until cancelled."
  static func terms(_ packages: [PurchasePackage]) -> String {
    let prices = packages.map { "\($0.price) / \($0.period)" }.formatted(.list(type: .or))
    if let trial = packages.compactMap(\.trial).first {
      return "\(trial) free trial, then \(prices). Renews until you cancel; cancel any time in Settings."
    }
    return "\(prices). Renews until you cancel; cancel any time in Settings."
  }
}

/// Tells the server to re-read this account's subscriptions from RevenueCat, then reports the
/// membership. The SDK saying "purchased" never shows Pro; only this does (docs/PAYWALL.md §5).
enum BillingAPI {
  static func refresh() async {
    do {
      let token = try await supabase.auth.session.accessToken
      var request = URLRequest(url: AppConfig.current.webURL.appending(path: "api/billing/refresh"))
      request.httpMethod = "POST"
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      request.timeoutInterval = 20
      _ = try await URLSession.shared.data(for: request)
    } catch {
      // The webhook or the next refresh still gets there; polling continues regardless.
      Log.data.warning("Billing refresh failed: \(error.localizedDescription, privacy: .public)")
    }
  }
}

/// Buying, restoring and waiting for the server to confirm Pro.
@MainActor @Observable
final class PurchaseFlow {
  enum State: Equatable {
    case idle
    /// The store sheet is up, or restore is running.
    case working
    /// Paid; waiting for the server to say Pro.
    case confirming
    /// Still not Pro after the wait. Retrying only looks again, it never charges again.
    case timedOut
    case pendingApproval
    case failed(String)
  }

  private(set) var state = State.idle
  let client: (any PurchasesClient)?
  private let refresh: @Sendable () async -> Void
  /// Reloads membership and says whether it's Pro now.
  private let confirmPro: @MainActor () async -> Bool
  private let sleep: @Sendable (Duration) async -> Void
  private let waitLimit: Duration
  private var source: PaywallRouter.Source = .profile
  /// The account the SDK is signed in as, so a sign-out only resets what was signed in.
  var identified: UUID?

  init(
    client: (any PurchasesClient)?,
    refresh: @escaping @Sendable () async -> Void = { await BillingAPI.refresh() },
    confirmPro: @escaping @MainActor () async -> Bool = { false },
    sleep: @escaping @Sendable (Duration) async -> Void = { try? await Task.sleep(for: $0) },
    waitLimit: Duration = .seconds(30)
  ) {
    self.client = client
    self.refresh = refresh
    self.confirmPro = confirmPro
    self.sleep = sleep
    self.waitLimit = waitLimit
  }

  var isAvailable: Bool { client != nil }
  var isBusy: Bool { state == .working || state == .confirming }

  func reset() { state = .idle }

  /// Re-reads this account's subscriptions on the server (the caller reloads membership).
  func refreshFromServer() async {
    guard client != nil else { return }
    await refresh()
  }

  func buy(_ packageId: String, source: PaywallRouter.Source) async {
    guard let client, !isBusy else { return }
    self.source = source
    state = .working
    do {
      switch try await client.purchase(packageId) {
      case .cancelled: state = .idle
      case .pending: state = .pendingApproval
      case .purchased: await confirm()
      }
    } catch {
      Log.data.error("Purchase failed: \(error.localizedDescription, privacy: .public)")
      state = .failed("The purchase didn’t go through. You haven’t been charged.")
    }
  }

  func restore(source: PaywallRouter.Source) async {
    guard let client, !isBusy else { return }
    self.source = source
    state = .working
    do {
      try await client.restore()
      await confirm()
    } catch {
      Log.data.error("Restore failed: \(error.localizedDescription, privacy: .public)")
      state = .failed("Couldn’t restore purchases. Try again.")
    }
  }

  /// Retry after a timeout: looks again, never buys again.
  func retry() async {
    guard state == .timedOut else { return }
    await confirm()
  }

  /// Refresh on the server, then poll membership with backoff for up to `waitLimit`.
  func confirm() async {
    state = .confirming
    await refresh()
    var waited = Duration.zero
    var delay = Duration.seconds(1)
    while true {
      if await confirmPro() {
        state = .idle
        Analytics.track(.purchaseCompleted, ["source": .string(source.rawValue), "platform": .string("ios")])
        return
      }
      if waited >= waitLimit { break }
      await sleep(delay)
      waited += delay
      delay = min(delay * 2, .seconds(8))
    }
    state = .timedOut
  }

  #if DEBUG
    func preview(_ state: State) { self.state = state }
  #endif
}

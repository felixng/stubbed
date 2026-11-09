import Foundation
import RevenueCat

/// The real purchasing client, on RevenueCat's SDK. Built only when a public SDK key is
/// configured (Config/*.xcconfig); with none, the app has no purchasing client at all.
final class RevenueCatPurchasesClient: PurchasesClient, @unchecked Sendable {
  private let apiKey: String
  private let lock = NSLock()
  private var configured = false

  init(apiKey: String) { self.apiKey = apiKey }

  func identify(_ userId: UUID) async throws {
    let id = userId.uuidString.lowercased()
    let first = lock.withLock { () -> Bool in
      defer { configured = true }
      return !configured
    }
    if first {
      Purchases.configure(withAPIKey: apiKey, appUserID: id)
    } else if Purchases.shared.appUserID != id {
      _ = try await Purchases.shared.logIn(id)
    }
  }

  func reset() async throws {
    guard lock.withLock({ configured }), !Purchases.shared.isAnonymous else { return }
    _ = try await Purchases.shared.logOut()
  }

  func packages() async throws -> [PurchasePackage] {
    guard lock.withLock({ configured }) else { return [] }
    let offerings = try await Purchases.shared.offerings()
    guard let offering = offerings.offering(identifier: "default") ?? offerings.current else { return [] }
    var result: [PurchasePackage] = []
    for (package, period) in [(offering.monthly, "month"), (offering.annual, "year")] {
      guard let package else { continue }
      let product = package.storeProduct
      var trial: String?
      if let intro = product.introductoryDiscount, intro.paymentMode == .freeTrial,
        await Purchases.shared.checkTrialOrIntroDiscountEligibility(product: product) == .eligible
      {
        trial = Self.describe(intro.subscriptionPeriod)
      }
      result.append(PurchasePackage(
        id: package.identifier, title: period == "year" ? "Annual" : "Monthly",
        price: product.localizedPriceString, period: period, trial: trial))
    }
    return result
  }

  func purchase(_ packageId: String) async throws -> PurchaseOutcome {
    let offerings = try await Purchases.shared.offerings()
    guard let package = (offerings.offering(identifier: "default") ?? offerings.current)?
      .availablePackages.first(where: { $0.identifier == packageId })
    else { throw PurchaseError.unknownPackage }
    do {
      let result = try await Purchases.shared.purchase(package: package)
      return result.userCancelled ? .cancelled : .purchased
    } catch let error as ErrorCode where error == .paymentPendingError {
      return .pending
    }
  }

  func restore() async throws { _ = try await Purchases.shared.restorePurchases() }

  enum PurchaseError: Error { case unknownPackage }

  private static func describe(_ period: SubscriptionPeriod) -> String {
    let n = period.value
    switch period.unit {
    case .day: return "\(n)-day"
    case .week: return "\(n * 7)-day"
    case .month: return "\(n)-month"
    case .year: return "\(n)-year"
    @unknown default: return "\(n)"
    }
  }
}

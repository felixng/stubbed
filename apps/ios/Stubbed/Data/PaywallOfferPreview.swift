#if DEBUG
  import Foundation

  /// `-paywallOffer eligible|standard|confirming|timeout` fakes a store offering and purchase
  /// state for screenshots and UI tests, with no store and no key. It doesn't exist in Release.
  enum PaywallOfferPreview: String {
    case eligible, standard, confirming, timeout

    static var mode: PaywallOfferPreview? {
      UserDefaults.standard.string(forKey: "paywallOffer").flatMap(PaywallOfferPreview.init)
    }

    private var packages: [PurchasePackage] {
      let trial = self == .standard ? nil : "30-day"
      return [
        PurchasePackage(id: "$rc_monthly", title: "Monthly", price: "£2.99", period: "month", trial: trial),
        PurchasePackage(id: "$rc_annual", title: "Annual", price: "£19.99", period: "year", trial: trial),
      ]
    }

    @MainActor func router(confirm: @escaping @MainActor () async -> Bool) -> PaywallRouter {
      let client = PreviewClient(packages: packages)
      let flow = PurchaseFlow(client: client, confirmPro: confirm)
      switch self {
      case .confirming: flow.preview(.confirming)
      case .timeout: flow.preview(.timedOut)
      default: break
      }
      return PaywallRouter(provider: RevenueCatOfferProvider(client: client), flow: flow)
    }
  }

  private struct PreviewClient: PurchasesClient {
    let packages: [PurchasePackage]
    func identify(_ userId: UUID) async throws {}
    func reset() async throws {}
    func packages() async throws -> [PurchasePackage] { packages }
    func purchase(_ packageId: String) async throws -> PurchaseOutcome { .cancelled }
    func restore() async throws {}
  }
#endif

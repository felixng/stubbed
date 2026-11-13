import Foundation
import Observation
import Supabase

/// The caller's membership, as `my_membership()` reports it (docs/PAYWALL.md section 5).
struct MembershipInfo: Decodable, Equatable, Sendable {
  let tier: String
  let source: String?
  let expires_at: String?
  let will_renew: Bool
  let is_trial: Bool
  let manage: [String]
  /// An admin testing the paywall before launch (`paywall_preview_admins`): show it as if both
  /// switches were on. The database already locks their paid stats.
  var paywall_preview: Bool? = nil
  var isPro: Bool { tier == "pro" }
  static let free = MembershipInfo(
    tier: "free", source: nil, expires_at: nil, will_renew: false, is_trial: false, manage: [])
}

/// `app_config` (docs/PAYWALL.md section 6). Missing rows mean "off", never a crash.
struct ProConfig: Equatable, Sendable {
  var displayName = "Pro"
  var salesEnabled = false
  var gatesEnabled = false
  var mediaGalleriesEnabled = false
  var mediaVideoEnabled = false

  init(displayName: String = "Pro", salesEnabled: Bool = false, gatesEnabled: Bool = false) {
    self.displayName = displayName
    self.salesEnabled = salesEnabled
    self.gatesEnabled = gatesEnabled
  }

  /// `adminPreview`: the caller is an admin testing the paywall, so both switches count as on.
  init(rows: [String: String], adminPreview: Bool = false) {
    if let name = rows["pro_display_name"], !name.isEmpty { displayName = name }
    salesEnabled = adminPreview || rows["paywall_sales_enabled"] == "true"
    gatesEnabled = adminPreview || rows["paywall_gates_enabled"] == "true"
    mediaGalleriesEnabled = rows["media_gallery_uploads_enabled"] == "true"
    mediaVideoEnabled = rows["media_video_uploads_enabled"] == "true"
  }
}

/// Who the signed-in user is to the paywall: their membership, the tier's name and the two
/// rollout switches, plus the feature policy so views ask "can I use this?" and never
/// hard-code a tier. Loads on sign-in and on returning to the foreground, and clears on
/// sign-out or when the account changes.
@MainActor @Observable
final class Membership {
  private(set) var info: MembershipInfo?
  private(set) var config = ProConfig()
  private(set) var featureTiers: [String: String] = [:]
  /// Bumps whenever access could have changed (membership, switches or policy), so screens
  /// reload their data and drop rendered cards.
  private(set) var version = 0
  private var loadedFor: UUID?

  var name: String { config.displayName }
  var isPro: Bool { info?.isPro == true }
  var isFree: Bool { info != nil && !isPro }
  var salesEnabled: Bool { config.salesEnabled }

  /// Whether the caller may use a feature. Allowed while gates are off, for Pro, for a feature
  /// the policy makes free, and until the membership is known (the database enforces it anyway).
  func canUse(_ feature: String) -> Bool {
    guard config.gatesEnabled, let info, !info.isPro else { return true }
    return featureTiers[feature] != "pro"
  }

  func clear() {
    guard info != nil || loadedFor != nil || config != ProConfig() else { return }
    info = nil
    config = ProConfig()
    featureTiers = [:]
    loadedFor = nil
    version += 1
  }

  /// Sets the state directly (tests, and the DEBUG preview).
  func apply(info: MembershipInfo?, config: ProConfig, featureTiers: [String: String]) {
    let changed = self.info != info || self.config != config || self.featureTiers != featureTiers
    self.info = info
    self.config = config
    self.featureTiers = featureTiers
    if changed { version += 1 }
  }

  /// Loads for `userId`, or clears when nobody is signed in or the account changed.
  func reload(for userId: UUID?) async {
    guard let userId else { clear(); return }
    if let loadedFor, loadedFor != userId { clear() }
    #if DEBUG
      if let preview = PaywallPreview.mode {
        apply(info: preview == .pro ? Self.previewPro : .free,
          config: ProConfig(salesEnabled: true, gatesEnabled: true),
          featureTiers: PaywallPreview.policy)
        loadedFor = userId
        return
      }
    #endif
    do {
      struct ConfigRow: Decodable { let key: String; let value: String }
      struct PolicyRow: Decodable { let feature: String; let tier: String }
      async let membership: MembershipInfo = supabase.rpc("my_membership").execute().value
      async let configRows: [ConfigRow] = supabase.from("app_config").select("key, value").execute().value
      async let policyRows: [PolicyRow] = supabase.from("feature_access").select("feature, tier").execute().value
      let (m, c, p) = try await (membership, configRows, policyRows)
      guard self.loadedFor == nil || self.loadedFor == userId else { return }
      apply(
        info: m,
        config: ProConfig(
          rows: Dictionary(c.map { ($0.key, $0.value) }, uniquingKeysWith: { $1 }),
          adminPreview: m.paywall_preview == true),
        featureTiers: Dictionary(p.map { ($0.feature, $0.tier) }, uniquingKeysWith: { $1 }))
      loadedFor = userId
    } catch {
      // Keep what we had: access is enforced by the database either way.
      Log.data.warning("Loading membership failed: \(error.localizedDescription, privacy: .public)")
    }
  }

  #if DEBUG
    private static let previewPro = MembershipInfo(
      tier: "pro", source: "subscription", expires_at: nil, will_renew: true, is_trial: false,
      manage: ["app_store"])
  #endif
}

#if DEBUG
  /// `-paywallPreview free` (or `pro`) fakes gates and sales on with that membership, so
  /// screenshots and UI tests can show every locked state against a local database that has
  /// them off. It doesn't exist in Release.
  enum PaywallPreview {
    enum Mode { case free, pro }
    static var mode: Mode? {
      switch UserDefaults.standard.string(forKey: "paywallPreview") {
      case "free": .free
      case "pro": .pro
      default: nil
      }
    }
    static let policy = [
      "insights.current_year": "free", "insights.past_years": "pro", "insights.all_time": "pro",
      "insights.show_mix": "pro",
    ]
  }
#endif

import Foundation

/// Values the build writes into Info.plist from Config/*.xcconfig: local
/// Supabase for Debug, the hosted project for Release.
struct AppConfig: Sendable {
  let supabaseURL: URL
  let supabasePublishableKey: String
  let webURL: URL
  /// Google's iOS OAuth client; nil until it's set in Config/*.xcconfig.
  let googleClientID: String?
  /// Meta's app ID for sharing to Instagram Stories; nil until it's set.
  let facebookAppID: String?

  /// RevenueCat's public iOS SDK key; nil until it's set in Config/*.xcconfig (purchases off).
  let revenueCatKey: String?

  static let current = AppConfig(info: Bundle.main.infoDictionary ?? [:])

  init(info: [String: Any]) {
    func value(_ key: String) -> String {
      guard let value = info[key] as? String, !value.isEmpty else {
        fatalError("\(key) is missing from Info.plist. Check Config/*.xcconfig.")
      }
      return value
    }
    func url(_ key: String) -> URL {
      guard let url = URL(string: value(key)), url.scheme != nil else {
        fatalError("\(key) in Info.plist isn't a URL. Check Config/*.xcconfig.")
      }
      return url
    }
    supabaseURL = url("SupabaseURL")
    supabasePublishableKey = value("SupabasePublishableKey")
    webURL = url("WebURL")
    googleClientID = (info["GoogleIOSClientID"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    revenueCatKey = (info["RevenueCatIOSAPIKey"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    facebookAppID = (info["FacebookAppID"] as? String).flatMap { $0.isEmpty ? nil : $0 }
  }
}

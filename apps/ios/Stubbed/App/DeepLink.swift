import Foundation

/// Links that open in the app: shared entries (/e/:id), trips (/t/:id) and
/// profiles (/@handle, /@handle/followers|following), from the web site
/// (universal links, served by /.well-known/apple-app-site-association) or
/// the app's own scheme (stubbed://e/:id).
enum DeepLink {
  static func route(for url: URL, webHost: String? = AppConfig.current.webURL.host()) -> AppRouter.Route? {
    var parts: [String]
    switch url.scheme?.lowercased() {
    case "stubbed":
      // stubbed://e/<id> or stubbed://@handle. Read the text itself: URL
      // parsing takes "@handle" for login details.
      let rest = url.absoluteString.dropFirst("stubbed://".count)
      let path = rest.split(separator: "#", maxSplits: 1).first?.split(separator: "?", maxSplits: 1).first ?? ""
      parts = path.split(separator: "/").map(String.init)
    case "https", "http":
      guard let host = url.host()?.lowercased(), host == webHost?.lowercased() || host == "www.\(webHost ?? "")" else {
        return nil
      }
      parts = url.pathComponents.filter { $0 != "/" }
    default:
      return nil
    }
    parts = parts.filter { !$0.isEmpty }
    guard let first = parts.first else { return nil }

    if first.hasPrefix("@") {
      let handle = ProfileRules.normalizeHandle(first)
      guard ProfileRules.handleProblem(handle) == nil else { return nil }
      if parts.count == 2, let list = AppRouter.FollowList(rawValue: parts[1]) {
        return .follows(handle: handle, list: list)
      }
      return parts.count == 1 ? .profile(handle: handle) : nil
    }
    guard parts.count == 2, let id = UUID(uuidString: parts[1]) else { return nil }
    switch first {
    case "e": return .publicEntry(id, comments: url.fragment == "comments")
    case "t": return .publicTrip(id)
    default: return nil
    }
  }
}

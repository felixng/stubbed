import Foundation
import Supabase

enum NotificationCategory: String, Codable, CaseIterable, Identifiable, Sendable {
  case like, comment, follower, followRequest = "follow_request", followAccepted = "follow_accepted"
  var id: String { rawValue }
  var label: String {
    switch self {
    case .like: "Likes on your shows"
    case .comment: "Comments on your shows"
    case .follower: "New followers"
    case .followRequest: "Follow requests"
    case .followAccepted: "Accepted follow requests"
    }
  }
  var symbol: String { self == .like ? "heart" : self == .comment ? "bubble.left" : "person.badge.plus" }
}

struct NotificationItem: Decodable, Identifiable, Sendable {
  let id: UUID
  let category: NotificationCategory
  let updated_at: Date
  let revision: Int64
  let unread: Bool
  let actor_id: UUID
  let handle: String
  let display_name: String?
  let avatar_url: String?
  let actor_count: Int
  let show_title: String?
  let entry_id: UUID?

  var text: String {
    let name = display_name.flatMap { $0.isEmpty ? nil : $0 } ?? "@\(handle)"
    switch category {
    case .like:
      let others = actor_count > 1 ? " and \(actor_count - 1) \(actor_count == 2 ? "other" : "others")" : ""
      return "\(name)\(others) liked your \(show_title ?? "show") diary entry"
    case .comment: return "\(name) commented on your \(show_title ?? "show") diary entry"
    case .follower: return "\(name) started following you"
    case .followRequest: return "\(name) requested to follow you"
    case .followAccepted: return "\(name) accepted your follow request"
    }
  }
  var group: String {
    let calendar = Calendar.current
    if calendar.isDateInToday(updated_at) { return "Today" }
    if calendar.isDateInYesterday(updated_at) { return "Yesterday" }
    let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: updated_at), to: calendar.startOfDay(for: Date())).day ?? 7
    return days < 7 ? "This week" : "Earlier"
  }
  var route: AppRouter.Route {
    if category == .followRequest { return .followRequests }
    if let entry_id { return .publicEntry(entry_id, comments: category == .comment) }
    return .profile(handle: handle)
  }
}

struct NotificationChoice: Decodable, Sendable {
  let category: NotificationCategory
  var push: Bool
}

enum Notifications {
  static func page(before: NotificationItem? = nil) async throws -> [NotificationItem] {
    struct Cursor: Encodable { let before_time: Date; let before_id: UUID }
    if let before {
      return try await supabase.rpc("notification_inbox", params: Cursor(before_time: before.updated_at, before_id: before.id)).execute().value
    }
    return try await supabase.rpc("notification_inbox").execute().value
  }
  static func unreadCount() async throws -> Int { try await supabase.rpc("notification_unread_count").execute().value }
  static func read(_ item: NotificationItem) async throws {
    struct Seen: Encodable { let notification_id: UUID; let seen_revision: Int64 }
    try await supabase.rpc("notification_read", params: Seen(notification_id: item.id, seen_revision: item.revision)).execute()
  }
  static func readAll() async throws {
    try await supabase.rpc("notification_read_all").execute()
  }
  static func choices() async throws -> [NotificationChoice] {
    let rows: [NotificationChoice] = try await supabase.from("notification_category_preferences").select("category,push").execute().value
    return NotificationCategory.allCases.map { category in rows.first { $0.category == category } ?? NotificationChoice(category: category, push: true) }
  }
  static func set(_ category: NotificationCategory, enabled: Bool) async throws {
    struct Change: Encodable { let kind: NotificationCategory; let enabled: Bool }
    try await supabase.rpc("notification_set_category", params: Change(kind: category, enabled: enabled)).execute()
  }
}

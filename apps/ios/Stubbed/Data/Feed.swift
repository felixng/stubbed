import Foundation
import Supabase

/// Someone shown next to a show: in the feed, in lists, on comments.
struct Person: Decodable, Hashable, Identifiable, Sendable {
  let id: UUID
  let handle: String
  let displayName: String?
  let avatarURL: URL?
  var isPrivate = false

  enum CodingKeys: String, CodingKey {
    case id, handle
    case displayName = "display_name"
    case avatarURL = "avatar_url"
    case isPrivate = "is_private"
  }

  static let select = "id, handle, display_name, avatar_url, is_private"

  init(from decoder: any Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(UUID.self, forKey: .id)
    handle = try c.decodeIfPresent(String.self, forKey: .handle) ?? ""
    displayName = try c.decodeIfPresent(String.self, forKey: .displayName)
    avatarURL = try c.decodeIfPresent(String.self, forKey: .avatarURL).flatMap(URL.init(string:))
    isPrivate = try c.decodeIfPresent(Bool.self, forKey: .isPrivate) ?? false
  }

  var name: String { displayName.flatMap { $0.isEmpty ? nil : $0 } ?? "@\(handle)" }
}

/// Likes and comments on a public entry, and whether you liked it.
struct Reactions: Decodable, Hashable, Sendable {
  var likes = 0
  var comments = 0
  var liked = false
}

/// Likes and comments (supabase/migrations/20261014190000_likes_comments.sql).
/// Postgres decides who may like and comment; these stay thin.
enum ReactionsAPI {
  /// Counts for a page of entries, and whether you liked each, in one call.
  static func load(_ entryIds: [UUID]) async -> [UUID: Reactions] {
    guard !entryIds.isEmpty else { return [:] }
    struct Row: Decodable {
      let entry_id: UUID
      let likes: Int
      let comments: Int
      let liked: Bool
    }
    let rows: [Row] =
      (try? await supabase.rpc("entry_reactions", params: ["entry_ids": entryIds]).execute().value) ?? []
    return Dictionary(
      rows.map { ($0.entry_id, Reactions(likes: $0.likes, comments: $0.comments, liked: $0.liked)) },
      uniquingKeysWith: { a, _ in a })
  }

  static func setLiked(_ liked: Bool, entryId: UUID, userId: UUID) async throws {
    struct Like: Encodable {
      let entry_id: UUID
      let user_id: UUID
    }
    if liked {
      do {
        try await supabase.from("entry_likes").insert(Like(entry_id: entryId, user_id: userId)).execute()
      } catch where String(describing: error).contains("23505") {
        // Already liked: that's what was asked for.
      }
    } else {
      try await supabase.from("entry_likes").delete().eq("entry_id", value: entryId).eq("user_id", value: userId)
        .execute()
    }
  }
}

struct Comment: Decodable, Hashable, Identifiable, Sendable {
  let id: UUID
  let body: String
  let createdAt: Date
  let author: Person

  enum CodingKeys: String, CodingKey {
    case id, body, author
    case createdAt = "created_at"
  }

  init(from decoder: any Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(UUID.self, forKey: .id)
    body = try c.decode(String.self, forKey: .body)
    author = try c.decode(Person.self, forKey: .author)
    let raw = try c.decode(String.self, forKey: .createdAt)
    createdAt = Comment.parse(raw) ?? Date()
  }

  static func parse(_ timestamp: String) -> Date? {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: timestamp) { return d }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: timestamp)
  }

  /// "now", "5m", "3h", "2d", then a date: compact, as on the web.
  static func timeAgo(_ date: Date, now: Date = Date()) -> String {
    let seconds = max(0, Int(now.timeIntervalSince(date).rounded()))
    if seconds < 60 { return "now" }
    if seconds < 3600 { return "\(seconds / 60)m" }
    if seconds < 86400 { return "\(seconds / 3600)h" }
    if seconds < 7 * 86400 { return "\(seconds / 86400)d" }
    let sameYear = Calendar.current.component(.year, from: date) == Calendar.current.component(.year, from: now)
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_GB")
    f.dateFormat = sameYear ? "d MMM" : "d MMM yyyy"
    return f.string(from: date)
  }
}

extension ReactionsAPI {
  static let commentMax = 500

  /// An entry's comments, oldest first, like a conversation.
  static func comments(_ entryId: UUID) async throws -> [Comment] {
    try await supabase.from("entry_comments")
      .select("id, body, created_at, author:profiles!entry_comments_user_id_fkey(\(Person.select))")
      .eq("entry_id", value: entryId).order("created_at", ascending: true).execute().value
  }

  /// The latest few people who liked it.
  static func likers(_ entryId: UUID, limit: Int = 3) async -> [Person] {
    struct Row: Decodable { let person: Person? }
    let rows: [Row] =
      (try? await supabase.from("entry_likes").select("person:profiles!entry_likes_user_id_fkey(\(Person.select))")
        .eq("entry_id", value: entryId).order("created_at", ascending: false).limit(limit).execute().value) ?? []
    return rows.compactMap(\.person).filter { !$0.handle.isEmpty }
  }

  static func addComment(_ body: String, entryId: UUID, userId: UUID) async throws {
    struct Insert: Encodable {
      let entry_id: UUID
      let user_id: UUID
      let body: String
    }
    try await supabase.from("entry_comments").insert(Insert(entry_id: entryId, user_id: userId, body: body)).execute()
  }

  static func deleteComment(_ id: UUID) async throws {
    try await supabase.from("entry_comments").delete().eq("id", value: id).execute()
  }
}

/// One show in the home feed.
struct FeedItem: Identifiable, Hashable, Sendable {
  let entry: Entry
  let owner: Person
  let mine: Bool
  let photo: URL?
  /// Public shows only: private ones can't be liked or commented on.
  let reactions: Reactions?
  var id: UUID { entry.id }
}

/// The home feed: your shows and those of people you follow, newest first,
/// a page at a time (feed_entries in Postgres, so the web pages the same way).
enum Feed {
  static let pageSize = 20

  /// Where the next page starts: the last show's date, created_at and id.
  struct Cursor: Hashable, Sendable {
    let date: String
    let created: String
    let id: UUID
  }

  struct Page: Sendable {
    let items: [FeedItem]
    let next: Cursor?
  }

  private struct Row: Decodable {
    let entry: Entry
    let createdAt: String

    enum Keys: String, CodingKey { case created_at }

    init(from decoder: any Decoder) throws {
      entry = try Entry(from: decoder)
      createdAt = try decoder.container(keyedBy: Keys.self).decode(String.self, forKey: .created_at)
    }
  }

  static func page(after cursor: Cursor?, userId: UUID) async throws -> Page {
    struct Params: Encodable {
      let max_rows: Int
      let before_date: String?
      let before_created: String?
      let before_id: UUID?
    }
    let rows: [Row] = try await supabase.rpc(
      "feed_entries",
      params: Params(max_rows: pageSize, before_date: cursor?.date, before_created: cursor?.created, before_id: cursor?.id)
    )
    .select("\(Entry.select), created_at")
    .execute().value

    let ownerIds = Array(Set(rows.map(\.entry.userId)))
    let owners: [Person] =
      ownerIds.isEmpty
      ? [] : try await supabase.from("profiles").select(Person.select).in("id", values: ownerIds.map(\.uuidString)).execute().value
    let byId = Dictionary(owners.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    async let photos = Entries.signPhotos(rows.map(\.entry.photoPath))
    async let reactions = ReactionsAPI.load(rows.map(\.entry).filter { $0.visibility == .public }.map(\.id))
    let (signed, counts) = await (photos, reactions)

    let items = rows.compactMap { row -> FeedItem? in
      guard let owner = byId[row.entry.userId], !owner.handle.isEmpty else { return nil }
      let e = row.entry
      return FeedItem(
        entry: e, owner: owner, mine: e.userId == userId, photo: e.photoPath.flatMap { signed[$0] },
        reactions: e.visibility == .public ? counts[e.id] ?? Reactions() : nil)
    }
    // The cursor comes from the raw rows, so a show left out above can't
    // stall paging.
    let next = rows.count < pageSize ? nil : rows.last.map { Cursor(date: $0.entry.date, created: $0.createdAt, id: $0.entry.id) }
    return Page(items: items, next: next)
  }

}

import Foundation
import Supabase

/// Blocking (supabase/migrations/20261026120000_blocks.sql). Postgres does
/// the rest: blocking ends follows both ways, and the two stop seeing each
/// other. The blocked person isn't told.
enum Blocks {
  static func block(_ profileId: UUID) async throws {
    struct Row: Encodable { let blocked_id: UUID }
    do {
      try await supabase.from("blocks").insert(Row(blocked_id: profileId)).execute()
    } catch where String(describing: error).contains("23505") {
      // Already blocked: as asked.
    }
  }

  static func unblock(_ profileId: UUID) async throws {
    try await supabase.from("blocks").delete().eq("blocked_id", value: profileId).execute()
  }

  /// Whether you've blocked this profile (RLS shows you only your own blocks).
  static func isBlocked(_ profileId: UUID) async -> Bool {
    struct Row: Decodable { let blocked_id: UUID }
    let rows: [Row] = (try? await supabase.from("blocks").select("blocked_id").eq("blocked_id", value: profileId)
      .limit(1).execute().value) ?? []
    return !rows.isEmpty
  }

  /// Your blocked accounts, newest first.
  static func list() async throws -> [Person] {
    struct Row: Decodable {
      let id: UUID
      let handle: String
      let display_name: String?
      let avatar_url: URL?
    }
    let rows: [Row] = try await supabase.rpc("my_blocks").execute().value
    return rows.map { Person(id: $0.id, handle: $0.handle, displayName: $0.display_name, avatarURL: $0.avatar_url, isPrivate: false) }
  }
}

/// Reporting (supabase/migrations/20261026130000_reports.sql). Reports go to
/// the owner's admin page; nobody else can read them.
enum Reports {
  enum Target: Equatable {
    case entry(UUID), comment(UUID), profile(UUID)

    var type: String {
      switch self {
      case .entry: "entry"
      case .comment: "comment"
      case .profile: "profile"
      }
    }

    var id: UUID {
      switch self {
      case .entry(let id), .comment(let id), .profile(let id): id
      }
    }

    /// "this show", for the sheet's wording.
    var noun: String {
      switch self {
      case .entry: "this show"
      case .comment: "this comment"
      case .profile: "this profile"
      }
    }
  }

  enum Reason: String, CaseIterable, Identifiable {
    case spam, harassment, inappropriate, other
    var id: String { rawValue }

    var label: String {
      switch self {
      case .spam: "Spam"
      case .harassment: "Harassment or bullying"
      case .inappropriate: "Inappropriate content"
      case .other: "Something else"
      }
    }
  }

  static func send(_ target: Target, reason: Reason, note: String) async throws {
    struct Row: Encodable {
      let target_type: String
      let target_id: UUID
      let reason: String
      let note: String?
    }
    let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
    do {
      try await supabase.from("reports").insert(
        Row(target_type: target.type, target_id: target.id, reason: reason.rawValue,
            note: trimmed.isEmpty ? nil : String(trimmed.prefix(500)))
      ).execute()
    } catch where String(describing: error).contains("23505") {
      // Already reported and still open: nothing more to send.
    }
  }
}

import Foundation
import Supabase

/// An optional "on here around then" chip (#360, epic #419; #278 adds crawled
/// runs). Same shape as `suggest_shows` and the web's `ShowSuggestion`.
struct ShowSuggestion: Decodable, Hashable, Identifiable, Sendable {
  /// Nil only for crawled runs with no show yet (#278).
  let showId: UUID?
  let title: String
  let venueId: UUID
  let source: String
  let score: Double
  /// Run chips only (#278): the evidence reference and why it matched.
  var runId: UUID? = nil
  var eligibilityReason: String? = nil
  /// Server decision behind its own flag. No client autofills yet.
  var autofillEligible: Bool? = nil

  var id: String { "\(source)-\(showId?.uuidString ?? title)" }

  enum CodingKeys: String, CodingKey {
    case showId = "show_id"
    case title, source, score
    case venueId = "venue_id"
    case runId = "run_id"
    case eligibilityReason = "eligibility_reason"
    case autofillEligible = "autofill_eligible"
  }
}

enum ShowSuggestions {
  static let debounce: Duration = .milliseconds(250)
  static let timeout: Duration = .milliseconds(1500)
  static let maxPerSource = 3

  /// At most three per source and one chip per show+venue. Rows with no title are dropped.
  static func normalise(_ rows: [ShowSuggestion]) -> [ShowSuggestion] {
    var seen = Set<String>()
    var perSource: [String: Int] = [:]
    var out: [ShowSuggestion] = []
    for row in rows {
      let title = row.title.trimmingCharacters(in: .whitespacesAndNewlines)
      if title.isEmpty { continue }
      let key = "\(row.showId?.uuidString ?? "t:" + title.lowercased())|\(row.venueId)"
      if seen.contains(key) || perSource[row.source, default: 0] >= maxPerSource { continue }
      seen.insert(key)
      perSource[row.source, default: 0] += 1
      out.append(row)
    }
    return out
  }

  /// Runs `fetch` against a timeout. Never throws: failure or timeout is "no chips".
  static func load(
    timeout: Duration = ShowSuggestions.timeout,
    _ fetch: @escaping @Sendable () async throws -> [ShowSuggestion]
  ) async -> [ShowSuggestion] {
    await withTaskGroup(of: [ShowSuggestion]?.self) { group in
      group.addTask { try? await fetch() }
      group.addTask {
        try? await Task.sleep(for: timeout)
        return nil
      }
      let first = await group.next() ?? nil
      group.cancelAll()
      return normalise(first ?? [])
    }
  }

  static func fetch(venueId: UUID, date: String) async -> [ShowSuggestion] {
    struct Params: Encodable {
      let venue_ids: [UUID]
      let on_date: String
    }
    return await load {
      try await supabase.rpc("suggest_shows_v2", params: Params(venue_ids: [venueId], on_date: date))
        .execute().value
    }
  }

  /// The chosen chip's show, to fill the field through the usual selection path.
  static func show(id: UUID) async -> Show? {
    try? await supabase.from("shows").select().eq("id", value: id).single().execute().value
  }
}

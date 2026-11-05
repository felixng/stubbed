import Foundation
import Supabase

struct MezzanineDraft: Identifiable, Sendable {
  let id: UUID
  var source: MezzanineRow
  var show: ShowChoice
  var venue: VenueChoice
  var duplicate = false
  var selected = false
  var saved = false
  var error: String?

  var missing: [String] {
    var fields: [String] = []
    if show.title.isEmpty { fields.append("show") }
    if venue.name.isEmpty { fields.append("venue") }
    if venue.id == nil {
      if (venue.city ?? "").isEmpty { fields.append("city") }
      if (venue.country ?? "").isEmpty { fields.append("country") }
    }
    if source.date == nil { fields.append("date") }
    if source.invalidRating { fields.append("rating") }
    return fields
  }
}

enum MezzanineResolver {
  static func normalise(_ name: String) -> String {
    name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      .split(whereSeparator: \.isWhitespace).joined(separator: " ")
  }

  struct Existing: Decodable, Sendable, Hashable {
    let show_id: UUID
    let date: String
  }

  static func isDuplicate(show: UUID?, date: String?, existing: Set<Existing>) -> Bool {
    guard let show, let date else { return false }
    return existing.contains(Existing(show_id: show, date: date))
  }

  /// Only the importing owner's rows, filtered and paged: never the API's first 1,000 entries.
  static func existing(userId: UUID, shows: [UUID], before: Date) async throws -> Set<Existing> {
    var result: Set<Existing> = []
    let ids = Array(Set(shows)).sorted { $0.uuidString < $1.uuidString }
    for start in stride(from: 0, to: ids.count, by: 50) {
      let batch = ids[start..<min(start + 50, ids.count)].map(\.uuidString)
      var offset = 0
      while true {
        let rows: [Existing] = try await supabase.from("entries").select("show_id,date")
          .eq("user_id", value: userId).in("show_id", values: batch)
          .lte("created_at", value: before.ISO8601Format(.init(includingFractionalSeconds: true)))
          .order("id").range(from: offset, to: offset + 499).execute().value
        result.formUnion(rows)
        if rows.count < 500 { break }
        offset += 500
      }
    }
    return result
  }

  private enum Lookup: Sendable {
    case show(String, String)
    case venue(String, String, String)
  }
  private enum Match: Sendable {
    case show(String, ShowChoice)
    case venue(String, VenueChoice)
  }

  static func resolve(_ rows: [MezzanineRow], userId: UUID, before: Date,
                      progress: @MainActor (Int, Int) -> Void) async throws -> [MezzanineDraft] {
    var jobs: [Lookup] = []
    var seenShows: Set<String> = [], seenVenues: Set<String> = []
    func venueKey(_ row: MezzanineRow) -> String { normalise(row.venue) + "\u{1f}" + normalise(row.city) }
    for row in rows {
      let key = normalise(row.show)
      if !key.isEmpty && seenShows.insert(key).inserted { jobs.append(.show(key, row.show)) }
      let vk = venueKey(row)
      if !row.venue.isEmpty && seenVenues.insert(vk).inserted { jobs.append(.venue(vk, row.venue, row.city)) }
    }
    var shows: [String: ShowChoice] = [:], venues: [String: VenueChoice] = [:]
    // Three network lookups at most; title tidying follows its show lookup.
    for start in stride(from: 0, to: jobs.count, by: 3) {
      try Task.checkCancellation()
      let matches = try await withThrowingTaskGroup(of: Match.self) { group in
        for job in jobs[start..<min(start + 3, jobs.count)] {
          group.addTask {
            switch job {
            case .show(let key, let title):
              if let same = try await Entries.similarShows(title).first(where: \.same) {
                return .show(key, ShowChoice(same.item))
              }
              return .show(key, ShowChoice(newTitle: try await Entries.tidyShowTitle(title)))
            case .venue(let key, let name, let city):
              if let same = try await Entries.similarVenues(name, near: nil, city: city).first(where: \.same) {
                return .venue(key, VenueChoice(same.item))
              }
              return .venue(key, VenueChoice(name: name, city: city, country: nil))
            }
          }
        }
        var results: [Match] = []
        for try await match in group { results.append(match) }
        return results
      }
      for match in matches {
        switch match {
        case .show(let key, let show): shows[key] = show
        case .venue(let key, let venue): venues[key] = venue
        }
      }
      await progress(min(start + 3, jobs.count), jobs.count)
    }
    let existing = try await existing(userId: userId, shows: shows.values.compactMap(\.id), before: before)
    return rows.map { row in
      var draft = MezzanineDraft(id: UUID(), source: row,
        show: shows[normalise(row.show)] ?? ShowChoice(newTitle: row.show),
        venue: venues[venueKey(row)] ?? VenueChoice(name: row.venue, city: row.city, country: nil))
      draft.duplicate = isDuplicate(show: draft.show.id, date: row.date, existing: existing)
      draft.selected = draft.missing.isEmpty && !draft.duplicate
      return draft
    }
  }
}

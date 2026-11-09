import Foundation
import Supabase

struct InsightStats: Codable, Sendable {
  struct RepeatedShow: Codable, Identifiable, Sendable {
    let id: UUID
    let title: String
    let count: Int
    let rank: Int
  }
  struct Streaks: Codable, Sendable {
    let current_daily: Int
    let longest_daily: Int
    let current_weekly: Int
    let longest_weekly: Int
  }
  struct Year: Codable, Identifiable, Sendable {
    let year: Int
    let count: Int
    var id: Int { year }
  }
  struct Month: Codable, Identifiable, Sendable {
    let month: String
    let count: Int
    var id: String { month }
  }
  struct Activity: Codable, Sendable {
    let date: String
    let count: Int
  }
  struct Category: Codable, Identifiable, Sendable {
    let type: String
    let count: Int
    var id: String { type }
    var label: String { (ShowType(rawValue: type) ?? .other).label }
  }
  struct Country: Codable, Identifiable, Sendable {
    let country: String
    let count: Int
    var id: String { country }
    var name: String {
      Locale.current.localizedString(forRegionCode: country) ?? country.capitalized
    }
  }
  let total: Int
  let unique_shows: Int
  let repeated_shows: [RepeatedShow]
  let unlocated: Int
  let streaks: Streaks
  let years: [Year]
  let months: [Month]
  let days: [Activity]
  let types: [Category]
  let countries: [Country]
  /// What the server withheld (docs/PAYWALL.md section 3). Absent from older responses.
  var access: Access? = nil

  struct Access: Codable, Equatable, Sendable {
    let tier: String
    let period: String
    let locked: [String]
  }
  /// True when the server emptied this field because the caller's plan doesn't include it.
  /// Views and cards ask this and never look at a tier themselves.
  func isLocked(_ field: String) -> Bool { access?.locked.contains(field) == true }

  var activity: [String: Int] { Dictionary(days.map { ($0.date, $0.count) }, uniquingKeysWith: +) }
  static var currentYear: Int { Int(Day.today().prefix(4)) ?? 2026 }
}

enum Insights {
  struct Params: Encodable {
    let selected_year: Int?
    let today: String
  }
  static func load(year: Int?) async throws -> InsightStats {
    let stats: InsightStats = try await supabase
      .rpc("own_insights", params: Params(selected_year: year, today: Day.today()))
      .execute().value
    #if DEBUG
      if PaywallPreview.mode == .free { return stats.previewLocked(year: year) }
    #endif
    return stats
  }

  /// The server refused a locked drill-down (`42501`, `upgrade_required:<feature>`).
  static func isUpgradeRequired(_ error: Error) -> Bool {
    if let error = error as? PostgrestError { return error.message.hasPrefix("upgrade_required:") }
    return false
  }

  struct Filter: Hashable, Sendable {
    var year: Int?
    var day: String?
    var country: String?
    var type: String?
    var show: UUID?
    var title: String
  }
  struct Visit: Codable, Identifiable, Sendable {
    let id: UUID
    let date: String
    let title: String
    let venue: String?
    let rating: Double?
  }
  static func visits(_ filter: Filter, offset: Int) async throws -> [Visit] {
    #if DEBUG
      if PaywallPreview.mode == .free, filter.type != nil || (filter.year ?? InsightStats.currentYear) != InsightStats.currentYear {
        throw PostgrestError(message: "upgrade_required:insights.show_mix")
      }
    #endif
    struct Params: Encodable {
      let selected_year: Int?
      let selected_day: String?
      let selected_country: String?
      let selected_type: String?
      let page_offset: Int
      let selected_show: UUID?
    }
    return try await supabase.rpc(
      "own_insight_entries",
      params: Params(
        selected_year: filter.year, selected_day: filter.day, selected_country: filter.country,
        selected_type: filter.type, page_offset: offset, selected_show: filter.show)
    ).execute().value
  }
}

extension InsightStats {
  /// A stand-in for a locked card: made-up numbers, never the user's data.
  static let sample: InsightStats = {
    let json = """
      {"total":24,"unique_shows":19,"repeated_shows":[{"id":"00000000-0000-0000-0000-000000000001","title":"Sample show","count":3,"rank":1}],
       "unlocated":0,"streaks":{"current_daily":0,"longest_daily":3,"current_weekly":4,"longest_weekly":6},
       "years":[{"year":2026,"count":24},{"year":2025,"count":31},{"year":2024,"count":18}],
       "months":[{"month":"2026-01","count":2},{"month":"2026-02","count":4},{"month":"2026-03","count":3},{"month":"2026-04","count":5},{"month":"2026-05","count":2}],
       "days":[{"date":"2026-02-14","count":1},{"date":"2026-03-07","count":1}],
       "types":[{"type":"musical","count":11},{"type":"play","count":8},{"type":"opera","count":3},{"type":"dance","count":2}],
       "countries":[{"country":"GB","count":20},{"country":"US","count":4}],"access":null}
      """
    return try! JSONDecoder().decode(InsightStats.self, from: Data(json.utf8))
  }()
}

#if DEBUG
  extension InsightStats {
    /// What the server returns to a Free caller with gates on, for the `-paywallPreview free`
    /// launch argument: the same emptying rules as `own_insights` (docs/PAYWALL.md section 2).
    func previewLocked(year: Int?) -> InsightStats {
      let current = year == Self.currentYear
      var object = (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(self))) as? [String: Any] ?? [:]
      var locked = ["types"]
      object["types"] = []
      if current {
        object["years"] = []
        locked.insert("years", at: 0)
      } else {
        locked = ["total", "unique_shows", "repeated_shows", "unlocated", "streaks.longest_daily",
          "streaks.longest_weekly", "years", "months", "days", "types", "countries"]
        for key in ["repeated_shows", "years", "months", "days", "types", "countries"] { object[key] = [] }
        for key in ["total", "unique_shows", "unlocated"] { object[key] = 0 }
        var streaks = object["streaks"] as? [String: Any] ?? [:]
        streaks["longest_daily"] = 0
        streaks["longest_weekly"] = 0
        object["streaks"] = streaks
      }
      object["access"] = ["tier": "free", "period": year == nil ? "all" : current ? "current" : "past", "locked": locked]
      guard let data = try? JSONSerialization.data(withJSONObject: object),
        let result = try? JSONDecoder().decode(InsightStats.self, from: data)
      else { return self }
      return result
    }
  }
#endif

/// Calendar geometry only. Counting and streak rules are owned by Postgres.
enum ActivityGrid {
  static func weeks(year: Int) -> [[String?]] {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    guard let first = calendar.date(from: DateComponents(year: year, month: 1, day: 1)),
      let range = calendar.range(of: .day, in: .year, for: first)
    else { return [] }
    let leading = (calendar.component(.weekday, from: first) + 5) % 7
    let days: [String?] =
      Array(repeating: nil, count: leading)
      + range.map { offset in
        let date = calendar.date(byAdding: .day, value: offset - 1, to: first)!
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
      }
    return stride(from: 0, to: days.count, by: 7).map { start in
      let slice = Array(days[start..<min(start + 7, days.count)])
      return slice + Array(repeating: nil, count: 7 - slice.count)
    }
  }
}

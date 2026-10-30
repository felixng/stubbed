import Foundation
import Supabase

struct InsightStats: Decodable, Sendable {
  struct Streaks: Decodable, Sendable {
    let current_daily: Int
    let longest_daily: Int
    let current_weekly: Int
    let longest_weekly: Int
  }
  struct Year: Decodable, Identifiable, Sendable {
    let year: Int
    let count: Int
    var id: Int { year }
  }
  struct Month: Decodable, Identifiable, Sendable {
    let month: String
    let count: Int
    var id: String { month }
  }
  struct Activity: Decodable, Sendable {
    let date: String
    let count: Int
  }
  struct Category: Decodable, Identifiable, Sendable {
    let type: String
    let count: Int
    var id: String { type }
    var label: String { (ShowType(rawValue: type) ?? .other).label }
  }
  struct Country: Decodable, Identifiable, Sendable {
    let country: String
    let count: Int
    var id: String { country }
    var name: String {
      Locale.current.localizedString(forRegionCode: country) ?? country.capitalized
    }
  }
  let total: Int
  let unique_shows: Int
  let unlocated: Int
  let streaks: Streaks
  let years: [Year]
  let months: [Month]
  let days: [Activity]
  let types: [Category]
  let countries: [Country]

  var activity: [String: Int] { Dictionary(days.map { ($0.date, $0.count) }, uniquingKeysWith: +) }
  static var currentYear: Int { Int(Day.today().prefix(4)) ?? 2026 }
}

enum Insights {
  struct Params: Encodable {
    let selected_year: Int?
    let today: String
  }
  static func load(year: Int?) async throws -> InsightStats {
    try await supabase.rpc("own_insights", params: Params(selected_year: year, today: Day.today()))
      .execute().value
  }

  struct Filter: Hashable, Sendable {
    var year: Int?
    var day: String?
    var country: String?
    var type: String?
    var title: String
  }
  struct Visit: Decodable, Identifiable, Sendable {
    let id: UUID
    let date: String
    let title: String
    let venue: String?
    let rating: Double?
  }
  static func visits(_ filter: Filter, offset: Int) async throws -> [Visit] {
    struct Params: Encodable {
      let selected_year: Int?
      let selected_day: String?
      let selected_country: String?
      let selected_type: String?
      let page_offset: Int
    }
    return try await supabase.rpc(
      "own_insight_entries",
      params: Params(
        selected_year: filter.year, selected_day: filter.day, selected_country: filter.country,
        selected_type: filter.type, page_offset: offset)
    ).execute().value
  }
}

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

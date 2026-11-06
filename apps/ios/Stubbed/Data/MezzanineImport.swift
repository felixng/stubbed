import Foundation

/// Offline mapping of Mezzanine exports. Keep in step with lib/import/mezzanine.ts.
struct MezzanineRow: Sendable, Equatable {
  var show: String
  var venue: String
  var city: String
  var date: String?
  var rating: Double?
  var review: String
  var invalidRating: Bool
  var planned: Bool
}

enum MezzanineImport {
  static let maxFileBytes = 20 * 1024 * 1024

  static func checkFileSize(_ bytes: Int) throws {
    if bytes > maxFileBytes { throw Failure.tooLarge }
  }
  enum Failure: LocalizedError {
    case empty, unsupported, tooLarge
    var errorDescription: String? {
      switch self {
      case .tooLarge: "This file is too large. Choose a Mezzanine export smaller than 20 MB."
      case .empty: "No shows in this file."
      case .unsupported: "This doesn’t look like a Mezzanine export. Check that you picked the CSV or JSON file Mezzanine made."
      }
    }
  }

  static func parse(_ source: String, today: String = Day.today()) throws -> [MezzanineRow] {
    let text = source.replacingOccurrences(of: "\u{feff}", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { throw Failure.empty }
    if text.first == "{" || text.first == "[" {
      struct Export: Decodable {
        struct Contents: Decodable { let diaryEntries: [Item] }
        struct Named: Decodable { let name: String? }
        struct Theater: Decodable { let name: String?; let location: String? }
        struct Production: Decodable { let theater: Theater? }
        struct Item: Decodable {
          let show: Named?
          let production: Production?
          let date: String?
          let rating: Double?
          let review: String?
        }
        let data: Contents
      }
      guard let export = try? JSONDecoder().decode(Export.self, from: Data(text.utf8)) else { throw Failure.unsupported }
      guard !export.data.diaryEntries.isEmpty else { throw Failure.empty }
      return export.data.diaryEntries.map {
        row(show: $0.show?.name, venue: $0.production?.theater?.name, city: $0.production?.theater?.location,
            date: $0.date, rating: $0.rating.map(String.init(describing:)), review: $0.review, today: today)
      }
    }
    let records = try csv(text)
    guard let header = records.first else { throw Failure.empty }
    let required = ["date", "show", "theater", "location", "time", "specialTags", "customTags", "seat", "rating", "review", "notes"]
    guard Set(required).isSubset(of: Set(header)), Set(header).count == header.count else { throw Failure.unsupported }
    let indexes = Dictionary(uniqueKeysWithValues: header.enumerated().map { ($0.element, $0.offset) })
    let values = records.dropFirst().filter { !$0.allSatisfy { $0.isEmpty } }
    guard !values.isEmpty else { throw Failure.empty }
    return try values.map { fields in
      guard fields.count == header.count else { throw Failure.unsupported }
      func field(_ key: String) -> String { fields[indexes[key]!] }
      return row(show: field("show"), venue: field("theater"), city: field("location"), date: field("date"),
                 rating: field("rating"), review: field("review"), today: today)
    }
  }

  private static func row(show: String?, venue: String?, city: String?, date: String?, rating: String?, review: String?, today: String) -> MezzanineRow {
    func clean(_ value: String?) -> String { (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
    let day = calendarDay(date ?? "")
    let planned = day.map { $0 > today } ?? false
    let raw = clean(rating)
    let number = Double(raw)
    let invalid = !raw.isEmpty && (number == nil || !number!.isFinite || (number != 0 && !(0.5...5).contains(number!)))
    let stars = !invalid && number != nil && number != 0 ? (number! * 2).rounded() / 2 : nil
    return MezzanineRow(show: clean(show), venue: clean(venue), city: clean(city), date: day,
                        rating: planned ? nil : stars, review: String((review ?? "").prefix(10_000)),
                        invalidRating: invalid, planned: planned)
  }

  /// Read the calendar day as written; never convert the export timestamp to local time.
  static func calendarDay(_ source: String) -> String? {
    let day = String(source.prefix(10))
    let parts = day.split(separator: "-", omittingEmptySubsequences: false)
    guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
          day.utf8.allSatisfy({ $0 == 45 || (48...57).contains($0) }),
          let y = Int(parts[0]), y > 0, let m = Int(parts[1]), let d = Int(parts[2]) else { return nil }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    guard let date = calendar.date(from: DateComponents(year: y, month: m, day: d)) else { return nil }
    let c = calendar.dateComponents([.year, .month, .day], from: date)
    return c.year == y && c.month == m && c.day == d ? day : nil
  }

  /// RFC 4180 reader: escaped quotes, multiline fields, CRLF, and strict closing quotes.
  private static func csv(_ text: String) throws -> [[String]] {
    let chars = Array(text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n"))
    var rows: [[String]] = [], fields: [String] = []
    var field = "", quoted = false, closed = false, index = 0
    while index < chars.count {
      let c = chars[index]
      if quoted {
        if c == "\"" {
          if index + 1 < chars.count && chars[index + 1] == "\"" { field.append("\""); index += 1 }
          else { quoted = false; closed = true }
        } else { field.append(c) }
      } else if c == "," || c == "\n" {
        fields.append(field); field = ""; closed = false
        if c == "\n" { rows.append(fields); fields = [] }
      } else if c == "\"" && field.isEmpty && !closed {
        quoted = true
      } else {
        guard !closed && c != "\"" else { throw Failure.unsupported }
        field.append(c)
      }
      index += 1
    }
    guard !quoted else { throw Failure.unsupported }
    fields.append(field); rows.append(fields)
    return rows
  }
}

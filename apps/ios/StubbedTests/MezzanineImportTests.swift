import Foundation
import Testing
@testable import Stubbed

struct MezzanineImportTests {
  private let header = "date,show,theater,location,time,specialTags,customTags,seat,rating,review,notes"
  private func csv(_ date: String = "2026-10-01T00:00:00Z", rating: String = "4.5", review: String = "Review", city: String = "Test City") -> String {
    func quote(_ text: String) -> String { "\"" + text.replacingOccurrences(of: "\"", with: "\"\"") + "\"" }
    return [date, "Synthetic Show", "Example Theatre", city, "Evening", "", "", "A1", rating, review, "SECRET"].map(quote).joined(separator: ",")
  }
  private func parse(_ lines: String) throws -> [MezzanineRow] { try MezzanineImport.parse(lines, today: "2026-11-05") }

  @Test func normalCSVAndPrivateNotes() throws {
    let row = try #require(parse(header + "\n" + csv()).first)
    #expect(row.show == "Synthetic Show")
    #expect(row.venue == "Example Theatre")
    #expect(row.city == "Test City")
    #expect(row.date == "2026-10-01")
    #expect(row.rating == 4.5)
    #expect(row.review == "Review")
  }
  @Test func quotedReviewBOMAndWindowsLines() throws {
    let review = "Good, especially the \"finale\"\nSecond line"
    let source = "\u{feff}" + header + "\n" + csv(review: review)
    let rows = try parse(source.replacingOccurrences(of: "\n", with: "\r\n"))
    #expect(rows[0].review == review)
  }
  @Test(arguments: ["", "0", "0.3", "7", "NaN", "4.24", "4.25", "5"])
  func ratings(_ value: String) throws {
    let row = try parse(header + "\n" + csv(rating: value))[0]
    #expect(row.invalidRating == ["0.3", "7", "NaN"].contains(value))
    if value == "" || value == "0" { #expect(row.rating == nil) }
    if value == "4.24" { #expect(row.rating == 4) }
    if value == "4.25" { #expect(row.rating == 4.5) }
  }
  @Test(arguments: ["", "garbled", "2026-02-29T00:00:00Z", "2026-13-01", "10/01/2026"])
  func missingOrInvalidDate(_ value: String) throws {
    #expect(try parse(header + "\n" + csv(value))[0].date == nil)
  }
  @Test func futureAndLeapDay() throws {
    let future = try parse(header + "\n" + csv("2027-01-01T00:00:00Z"))[0]
    #expect(future.planned && future.rating == nil)
    #expect(MezzanineImport.calendarDay("2024-02-29T00:00:00Z") == "2024-02-29")
    // A calendar day stays literal, including west of UTC; parsing uses no local time zone.
    #expect(MezzanineImport.calendarDay("2026-10-01T00:00:00Z") == "2026-10-01")
  }
  @Test func neverMergesVisitsAndAllowsMissingCity() throws {
    let rows = try parse(header + "\n" + csv() + "\n" + csv() + "\n" + csv("2026-10-02", city: ""))
    #expect(rows.count == 3)
    #expect(rows[0] == rows[1])
    #expect(rows[2].city == "")
  }
  @Test func reorderedHeader() throws {
    let columns = header.split(separator: ",").map(String.init)
    let values = ["2026-10-01", "Synthetic Show", "Example Theatre", "Test City", "", "", "", "", "", "Review", "SECRET"]
    let rows = try parse(columns.reversed().joined(separator: ",") + "\n" + values.reversed().joined(separator: ","))
    #expect(rows[0].show == "Synthetic Show" && rows[0].review == "Review")
  }
  @Test func jsonMappingAndMissingProduction() throws {
    let rows = try parse("""
      {"appVersion":"test","data":{"lists":[],"diaryEntries":[
        {"review":"Public","notes":"SECRET","date":"2026-10-01T00:00:00Z","rating":0,
         "show":{"name":"Synthetic Show"},"production":{"theater":{"name":"Example Theatre","location":"Test City"}}},
        {"show":{"name":"Another Show"},"rating":4.5,"date":"2026-10-02"}
      ]}}
      """)
    #expect(rows.count == 2 && rows[0].rating == nil)
    #expect(rows[0].review == "Public" && rows[0].city == "Test City")
    #expect(rows[1].venue == "" && rows[1].rating == 4.5)
  }
  @Test(arguments: ["", "x,y\n1,2", "{}", "{\"data\":{\"diaryEntries\":[]}}", "[]", "not an export"])
  func unsupported(_ value: String) {
    #expect(throws: (any Error).self) { try parse(value) }
  }
  @Test func malformedCSVAndLongReview() throws {
    #expect(throws: (any Error).self) { try parse(header + "\n\"unclosed") }
    #expect(try parse(header + "\n" + csv(review: String(repeating: "x", count: 10_001)))[0].review.count == 10_000)
  }
  @Test func duplicatesUseOnlyExistingShowAndDate() {
    let show = UUID()
    let existing: Set<MezzanineResolver.Existing> = [.init(show_id: show, date: "2026-10-01")]
    #expect(MezzanineResolver.isDuplicate(show: show, date: "2026-10-01", existing: existing))
    #expect(!MezzanineResolver.isDuplicate(show: nil, date: "2026-10-01", existing: existing))
    #expect(!MezzanineResolver.isDuplicate(show: show, date: "2026-10-02", existing: existing))
    #expect(!MezzanineResolver.isDuplicate(show: show, date: "2026-10-02", existing: existing))
  }
}

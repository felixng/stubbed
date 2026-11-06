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

@MainActor
struct MezzanineReviewTests {
  private func draft(_ city: String, country: String? = nil) -> MezzanineDraft {
    MezzanineDraft(id: UUID(), source: MezzanineRow(show: "Synthetic Show", venue: "Example Theatre", city: city,
      date: "2026-10-01", rating: 4.5, review: "Public review", invalidRating: false, planned: false),
      show: ShowChoice(newTitle: "Synthetic Show"), venue: VenueChoice(name: "Example Theatre", city: city, country: country))
  }
  @Test func countriesApplyOncePerNormalisedCityAndSelectOnlyReadyRows() {
    let model = MezzanineReviewModel()
    model.rows = [draft("Test City"), draft(" test city "), draft("Another City")]
    model.rows[1].source.date = nil
    model.applyCountry("GB", city: "Test City")
    #expect(model.rows[0].venue.country == "GB" && model.rows[0].selected)
    #expect(model.rows[1].venue.country == "GB" && !model.rows[1].selected)
    #expect(model.rows[2].venue.country == nil)
    #expect(model.selected == 1)
  }
  @Test func countryChoiceNeverSelectsDuplicatesOrChangesMatchedVenues() {
    let model = MezzanineReviewModel()
    var duplicate = draft("Test City"); duplicate.duplicate = true
    var matched = draft("Test City", country: "US"); matched.venue.id = UUID()
    model.rows = [duplicate, matched]
    model.applyCountry("GB", city: "Test City")
    #expect(!model.rows[0].selected)
    #expect(model.rows[1].venue.country == "US")
  }
}

@MainActor
struct MezzanineBulkReviewTests {
  private func row(_ index: Int) -> MezzanineDraft {
    var row = MezzanineDraft(id: UUID(), source: MezzanineRow(show: "Show \(index)", venue: "Example Theatre", city: "Test City",
      date: "2026-10-01", rating: nil, review: "", invalidRating: false, planned: false),
      show: ShowChoice(newTitle: "Show \(index)"), venue: VenueChoice(id: UUID(), name: "Example Theatre", city: "Test City", country: "GB"))
    row.selected = true
    return row
  }
  @Test func bulkSelectionForThreeHundredRowsExcludesExceptionsAndDuplicates() {
    let model = MezzanineReviewModel()
    model.rows = (0..<300).map(row)
    model.rows[0].source.date = nil; model.rows[0].selected = false
    model.rows[1].duplicate = true; model.rows[1].selected = false
    #expect(model.ready.count == 298 && model.needsAttention.count == 1 && model.duplicates.count == 1)
    model.selectReady(false); #expect(model.selected == 0)
    model.selectReady(true); #expect(model.selected == 298)
    #expect(!model.rows[0].selected && !model.rows[1].selected)
  }
  @Test func stopKeepsPendingRowsAndResumeDoesNotSaveTheFirstTwice() async {
    let model = MezzanineReviewModel(); model.rows = (0..<3).map(row)
    var ids: [UUID] = []
    await model.save(userId: UUID()) { draft, _ in ids.append(draft.id); model.requestStop() }
    #expect(ids.count == 1 && model.added == 1 && model.stopped && model.remaining == 2)
    #expect(model.selected == 2 && model.resultDetails == "2 left")
    await model.save(userId: UUID()) { draft, _ in ids.append(draft.id) }
    #expect(ids.count == 3 && Set(ids).count == 3 && model.added == 3 && model.remaining == 0)
    #expect(model.resultDetails.isEmpty && model.resultTitle == "3 shows added to your diary")
  }
  @Test func invalidFileCannotBeRetriedAndLargeFileHasClearLimit() async throws {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".csv")
    try Data("not a Mezzanine file".utf8).write(to: url)
    defer { try? FileManager.default.removeItem(at: url) }
    let model = MezzanineReviewModel(url: url)
    await model.load(userId: UUID())
    #expect(model.error != nil && !model.retryable)
    #expect(throws: MezzanineImport.Failure.self) { try MezzanineImport.checkFileSize(MezzanineImport.maxFileBytes + 1) }
  }
}

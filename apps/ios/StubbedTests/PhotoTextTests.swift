import Foundation
import Testing
import UIKit
@testable import Stubbed

struct PhotoTextTests {
  private func lines(_ texts: [(String, Double)]) -> [PhotoText.Line] { texts.map { PhotoText.Line(text: $0.0, height: $0.1) } }

  // MARK: Printed dates

  @Test func readsADateWithMonthNameAndYear() {
    #expect(PhotoText.printedDate(in: ["Fortune Theatre", "Sat 3 Oct 2026 7.30pm"], country: nil) == "2026-10-03")
    #expect(PhotoText.printedDate(in: ["Fri, Aug 21, 2026 8:00 PM"], country: "US") == "2026-08-21")
    #expect(PhotoText.printedDate(in: ["14 September 2026 - 19:30"], country: "GB") == "2026-09-14")
  }

  @Test func aBareTimeIsNotADate() {
    #expect(PhotoText.printedDate(in: ["CHICAGO", "Ambassador Theatre", "19:30"], country: "GB") == nil)
    #expect(PhotoText.printedDate(in: ["Doors 7.00pm", "Curtain 7.30pm"], country: nil) == nil)
  }

  @Test func aDateWithoutAYearIsNotTrusted() {
    #expect(PhotoText.printedDate(in: ["Sat 3 Oct"], country: "GB") == nil)
  }

  @Test func numericDatesAreDayFirstExceptInTheUS() {
    #expect(PhotoText.printedDate(in: ["03/10/2026 19:30"], country: "GB") == "2026-10-03")
    #expect(PhotoText.printedDate(in: ["03/10/2026 19:30"], country: "US") == "2026-03-10")
  }

  @Test func anAmbiguousNumericDateWithNoCountryIsLeftAlone() {
    #expect(PhotoText.printedDate(in: ["03/10/2026"], country: nil) == nil)
    // Only one reading is possible.
    #expect(PhotoText.printedDate(in: ["21/08/2026"], country: nil) == "2026-08-21")
    #expect(PhotoText.printedDate(in: ["08/21/2026"], country: nil) == "2026-08-21")
    #expect(PhotoText.printedDate(in: ["31/02/2026"], country: "GB") == nil)
  }

  // MARK: Titles

  @Test func theBiggestPrintComesFirstAndPaperWordsAreLeftOut() {
    let found = PhotoText.titleCandidates(
      lines([
        ("PLAYBILL", 0.03), ("Richard Rodgers Theatre", 0.03), ("Hamilton", 0.12), ("An American Musical", 0.04),
        ("Sat 3 Oct 2026 7.30pm", 0.03), ("STALLS ROW F SEAT 12", 0.03),
      ]))
    #expect(found.first == "Hamilton")
    #expect(!found.contains("PLAYBILL"))
    #expect(!found.contains("Richard Rodgers Theatre"))
    #expect(!found.contains("STALLS ROW F SEAT 12"))
    #expect(!found.contains("Sat 3 Oct 2026 7.30pm"))
  }

  @Test func aTitleThatWrapsIsJoined() {
    let found = PhotoText.titleCandidates(lines([("OPERATION", 0.1), ("MINCEMEAT", 0.1)]))
    #expect(found.contains("OPERATION MINCEMEAT"))
  }

  @Test func aShowMatchesItsPrintedTitle() {
    #expect(PhotoText.isMatch(piece: "HADESTOWN", title: "Hadestown"))
    #expect(PhotoText.isMatch(piece: "LES MISÉRABLES", title: "Les Misérables"))
    #expect(PhotoText.isMatch(piece: "THE LION KING", title: "Lion King"))
    #expect(PhotoText.isMatch(piece: "OPERATION MINCEMEAT A New Musical Comedy", title: "Operation Mincemeat"))
    #expect(PhotoText.isMatch(piece: "SIX", title: "Six"))
  }

  @Test func aShowMatchesAnyNameItGoesBy() {
    let show = Show(id: UUID(), title: "Les Misérables", type: .musical)
    let names = [show.id: ["Les Misérables", "Les Mis"]]
    #expect(PhotoText.filterMatches(piece: "LES MIS", shows: [show], names: names) == [show])
    #expect(PhotoText.filterMatches(piece: "LES MIS", shows: [show], names: [:]).isEmpty)
    #expect(PhotoText.filterMatches(piece: "LES MISÉRABLES", shows: [show], names: [:]) == [show])
  }

  @Test func aShortTitleOnlyMatchesAlone() {
    #expect(!PhotoText.isMatch(piece: "SIXTY SIX FLOORS", title: "Six"))
    #expect(!PhotoText.isMatch(piece: "Wicked Games Night", title: "Wi"))
    #expect(!PhotoText.isMatch(piece: "Hamilton", title: "Chicago"))
  }

  @Test func paperIsTellingFromAStagePhoto() {
    #expect(PhotoText.Reading(lines: lines([("Fortune Theatre", 0.03), ("Sat 3 Oct 2026 7.30pm", 0.03)])).isPaper)
    #expect(PhotoText.Reading(lines: lines([("STALLS ROW F", 0.03), ("SEAT 12", 0.03)])).isPaper)
    #expect(!PhotoText.Reading(lines: lines([("EXIT", 0.05)])).isPaper)
    #expect(!PhotoText.Reading(lines: []).isPaper)
  }

  // MARK: On a picture (Vision, offline)

  private func picture(_ rows: [(String, CGFloat)], dark: Bool) throws -> Data {
    let size = CGSize(width: 1200, height: 1600)
    let image = UIGraphicsImageRenderer(size: size).image { ctx in
      (dark ? UIColor(red: 0.12, green: 0.08, blue: 0.16, alpha: 1) : UIColor(white: 0.96, alpha: 1)).setFill()
      ctx.fill(CGRect(origin: .zero, size: size))
      var y: CGFloat = 220
      for (text, points) in rows {
        let style = NSMutableParagraphStyle()
        style.alignment = .center
        NSAttributedString(
          string: text,
          attributes: [
            .font: UIFont.boldSystemFont(ofSize: points), .foregroundColor: dark ? UIColor.white : UIColor.black,
            .paragraphStyle: style,
          ]
        ).draw(in: CGRect(x: 60, y: y, width: size.width - 120, height: points * 1.5))
        y += points * 1.6
      }
    }
    return try #require(image.jpegData(compressionQuality: 0.9))
  }

  @Test func readsATicketFromAPicture() async throws {
    let data = try picture(
      [("HAMILTON", 90), ("Richard Rodgers Theatre", 40), ("Fri, Aug 21, 2026 8:00 PM", 40), ("ORCH Row C Seat 101", 34)],
      dark: false)
    let reading = try #require(await PhotoText.read(data))
    #expect(reading.isPaper)
    #expect(PhotoText.printedDate(in: reading.lines.map(\.text), country: "US") == "2026-08-21")
    #expect(PhotoText.titleCandidates(reading.lines).first.map { PhotoText.isMatch(piece: $0, title: "Hamilton") } == true)
  }

  @Test func aProgrammeTitleIsTheBiggestPrint() async throws {
    let data = try picture([("HADESTOWN", 130), ("Walter Kerr Theatre", 44)], dark: true)
    let reading = try #require(await PhotoText.read(data))
    #expect(PhotoText.titleCandidates(reading.lines).first.map { PhotoText.isMatch(piece: $0, title: "Hadestown") } == true)
  }

  @Test func aPictureWithNoTextReadsAsNothing() async throws {
    let blank = UIGraphicsImageRenderer(size: CGSize(width: 400, height: 400)).image { ctx in
      UIColor.orange.setFill()
      ctx.fill(CGRect(x: 0, y: 0, width: 400, height: 400))
    }
    let data = try #require(blank.jpegData(compressionQuality: 0.9))
    let reading = try #require(await PhotoText.read(data))
    #expect(reading.lines.isEmpty)
    #expect(!reading.isPaper)
  }
}

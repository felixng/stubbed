import Foundation
import Testing

@testable import Stubbed

struct InsightsTests {
  @Test func gridIncludesLeapDayAndKeepsMondayRows() {
    let weeks = ActivityGrid.weeks(year: 2024)
    let days = weeks.flatMap { $0 }.compactMap { $0 }
    #expect(days.count == 366)
    #expect(days.contains("2024-02-29"))
    #expect(weeks.first?.first == "2024-01-01")
    #expect(weeks.allSatisfy { $0.count == 7 })
  }

  @Test func gridPadsOutsideYearWithoutInventingActivity() {
    let weeks = ActivityGrid.weeks(year: 2026)
    #expect(weeks[0][0] == nil)
    #expect(weeks[0][3] == "2026-01-01")
    #expect(weeks.flatMap { $0 }.compactMap { $0 }.count == 365)
  }
}

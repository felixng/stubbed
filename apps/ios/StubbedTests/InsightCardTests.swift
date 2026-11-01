import Testing
@testable import Stubbed

struct InsightCardTests {
  private func stats(total: Int = 24, weekly: Int = 8) -> InsightStats {
    InsightStats(total: total, unique_shows: 18, unlocated: 2,
      streaks: .init(current_daily: 0, longest_daily: 4, current_weekly: weekly, longest_weekly: 12),
      years: [.init(year: 2026, count: total)], months: [.init(month: "2026-10", count: total)],
      days: [], types: [.init(type: "musical", count: 12), .init(type: "play", count: 6),
        .init(type: "opera", count: 2), .init(type: "dance", count: 1),
        .init(type: "comedy", count: 2), .init(type: "standup", count: 1)], countries: [])
  }
  @Test func periodsNeverRelabelLiveStreaks() {
    #expect(InsightCardDesign.available(stats(), year: 2026, currentYear: 2026) == [.weekly, .year, .mix])
    #expect(InsightCardDesign.available(stats(), year: 2025, currentYear: 2026) == [.year, .mix])
    #expect(InsightCardDesign.available(stats(), year: nil, currentYear: 2026) == [.weekly, .mix])
    #expect(InsightCardDesign.available(stats(total: 0, weekly: 0), year: 2026, currentYear: 2026).isEmpty)
    // A live streak can carry over into a year with no visits yet.
    #expect(InsightCardDesign.available(stats(total: 0), year: 2026, currentYear: 2026) == [.weekly])
  }
  @Test @MainActor func allAggregateCardsExportEveryAppearance() throws {
    let data = InsightCardData(stats: stats(), year: 2026, handle: "sillyelphaba", currentYear: 2026)
    let cards = try ShareCards.insightsCards(data)
    #expect(cards.map(\.id) == ["weekly-streak", "year-in-theatre", "show-mix"])
    for card in cards {
      #expect(card.supportsBackground)
      #expect(!card.showsRating)
      for appearance in ShareAppearance.variants {
        let asset = card.asset(for: appearance)
        #expect(asset.image.cgImage?.width == 1080)
        #expect(asset.image.cgImage?.height == 1080)
      }
    }
  }
}

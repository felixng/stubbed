import Testing
import UIKit
@testable import Stubbed

struct InsightCardTests {
  private func stats(total: Int = 24, weekly: Int = 8) -> InsightStats {
    InsightStats(total: total, unique_shows: min(total, 18), repeated_shows: [], unlocated: total == 0 ? 0 : 2,
      streaks: .init(current_daily: 0, longest_daily: 4, current_weekly: weekly, longest_weekly: 12),
      years: [.init(year: 2026, count: total)], months: [.init(month: "2026-10", count: total)],
      days: [], types: total == 0 ? [] : [.init(type: "musical", count: 12), .init(type: "play", count: 6),
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
  @Test @MainActor func showSharingContainsAllEightWithTheirOwnContext() throws {
    let photo = UIGraphicsImageRenderer(size: CGSize(width: 10, height: 10)).image { context in
      UIColor.blue.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 10, height: 10))
    }
    let entry = EntryCardData(title: "A past show", venue: nil, whereText: "", date: "1 Nov 2025",
      year: 2025, rating: 1, showOfYear: 12, venueVisit: 0, timesSeen: 1, handle: "ios_test")
    let insights = InsightCardData(stats: stats(total: 0, weekly: 0), year: 2026, handle: "ios_test", currentYear: 2026)
    let cards = try ShareCards.showCards(entry, photo: photo, insights: insights)
    #expect(cards.map(\.id) == ["stats", "name", "data", "encore", "show-number", "weekly-streak", "year-in-theatre", "show-mix"])
    #expect(cards[3].name == "First visit")
    #expect(cards[3].file.lastPathComponent.contains("first-visit"))
    #expect(cards.filter(\.isInsights).map(\.id) == ["weekly-streak", "year-in-theatre", "show-mix"])
    let backgroundsSupported = cards.filter(\.isInsights).allSatisfy(\.supportsBackground)
    #expect(backgroundsSupported)
    #expect(cards.allSatisfy { $0.image.cgImage?.width == 1080 })
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

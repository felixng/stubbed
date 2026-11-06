import Foundation
import Testing
import UIKit
@testable import Stubbed

struct InsightCardTests {
  private func stats(total: Int = 24, weekly: Int = 8) -> InsightStats {
    InsightStats(total: total, unique_shows: min(total, 18),
      repeated_shows: total == 0 ? [] : (1...6).map {
        .init(id: UUID(uuidString: String(format: "00000000-0000-4000-8000-%012d", $0))!,
          title: $0 == 1 ? "The Very Long Name of a Show I Keep Coming Back to See" : "Favourite show \($0)",
          count: 8 - $0, rank: $0)
      }, unlocated: total == 0 ? 0 : 2,
      streaks: .init(current_daily: total == 0 ? 0 : 2, longest_daily: 4, current_weekly: weekly, longest_weekly: 12),
      years: total == 0 ? [] : [.init(year: 2026, count: total), .init(year: 2024, count: 10)],
      months: total == 0 ? [] : [.init(month: "2026-10", count: total), .init(month: "2024-06", count: 10)],
      days: total == 0 ? [] : [.init(date: "2026-10-01", count: total), .init(date: "2024-06-01", count: 10)],
      types: total == 0 ? [] : [.init(type: "musical", count: 12), .init(type: "play", count: 6),
        .init(type: "opera", count: 2), .init(type: "dance", count: 1),
        .init(type: "comedy", count: 2), .init(type: "standup", count: 1)],
      countries: total == 0 ? [] : [.init(country: "GB", count: 12), .init(country: "US", count: 8), .init(country: "FR", count: 2)])
  }

  @Test func periodsAndSectionEligibility() {
    let current = InsightCardDesign.available(stats(), year: 2026, currentYear: 2026)
    #expect(current == [.year, .weekly, .daily, .bestWeekly, .bestDaily, .activity, .repeats, .countries, .mix, .history])
    let historical = InsightCardDesign.available(stats(), year: 2024, currentYear: 2026)
    #expect(!historical.contains(.weekly))
    #expect(!historical.contains(.daily))
    #expect(historical.contains(.bestDaily))
    #expect(historical.contains(.activity))
    #expect(InsightCardDesign.available(stats(total: 0, weekly: 0), year: 2026, currentYear: 2026).isEmpty)
    // A current streak may carry over into a year with no visits yet.
    #expect(InsightCardDesign.available(stats(total: 0), year: 2026, currentYear: 2026) == [.weekly])
    for section in InsightShareSection.allCases {
      #expect(section.designs.contains { current.contains($0) })
    }
  }

  @Test func activityYearAndExportNamesDoNotInheritUnrelatedFilters() {
    let data = InsightCardData(stats: stats(), year: nil, handle: "ios_test", currentYear: 2026, activityYear: 2024)
    #expect(data.calendarYear == 2024)
    #expect(data.available.contains(.activity))
    #expect(data.filenamePeriod(for: .activity) == "2024")
    #expect(data.filenamePeriod(for: .history) == "all-time")
    #expect(data.filenamePeriod(for: .weekly) == "current")
    #expect(data.filenamePeriod(for: .year) == "all-time")
    let emptyCalendar = InsightCardData(stats: stats(), year: nil, handle: nil, currentYear: 2026, activityYear: 2023)
    #expect(!emptyCalendar.available.contains(.activity))
    let historical = InsightCardData(stats: stats(), year: 2024, handle: nil, currentYear: 2026, activityYear: 2026)
    #expect(historical.calendarYear == 2024)
    #expect(historical.filenamePeriod(for: .bestWeekly) == "2024")
  }

  @Test @MainActor func showSharingContainsAllTenWithTheirOwnContext() throws {
    let photo = UIGraphicsImageRenderer(size: CGSize(width: 10, height: 10)).image { context in
      UIColor.blue.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 10, height: 10))
    }
    let entry = EntryCardData(title: "A past show", venue: nil, whereText: "", date: "1 Nov 2025",
      year: 2025, rating: 1, showOfYear: 12, venueVisit: 0, timesSeen: 1, handle: "ios_test")
    let insights = InsightCardData(stats: stats(total: 0, weekly: 0), year: 2026, handle: "ios_test", currentYear: 2026)
    let cards = try ShareCards.showCards(entry, photo: photo, insights: insights)
    #expect(cards.map(\.id) == ["stats", "name", "data", "encore", "show-number", "overlay", "ticket", "weekly-streak", "year-in-theatre", "show-mix"])
    #expect(cards[3].name == "First visit")
    #expect(cards[3].file.lastPathComponent.contains("first-visit"))
    #expect(cards.filter(\.isInsights).map(\.id) == ["weekly-streak", "year-in-theatre", "show-mix"])
    #expect(cards.filter(\.isInsights).allSatisfy { $0.supportsBackground })
    #expect(cards.allSatisfy { $0.image.cgImage?.width == 1080 })
    var venueEntry = entry
    // Exercise long names in both fixed text regions of the venue export.
    venueEntry.venue = "The Stephen Sondheim Theatre at the Harold Pinter"
    venueEntry.title = "The Curious Incident of the Dog in the Night-Time"
    venueEntry.venueVisit = 3
    let withVenue = try ShareCards.showCards(venueEntry, photo: photo, insights: insights)
    let venueIndex = try #require(withVenue.firstIndex { $0.id == "venue-visits" })
    #expect(withVenue[venueIndex + 1].id == "year-in-theatre")
    #expect(!withVenue[venueIndex].isInsights)
    #expect(withVenue[venueIndex].supportsBackground)

  }

  @Test @MainActor func selectedCardPreparationIsCompleteAndCancellable() async throws {
    let data = InsightCardData(stats: stats(), year: 2026, handle: "ios_test", currentYear: 2026)
    let card = try await ShareCards.prepareInsightCard(data, design: .activity)
    #expect(card.id == "activity")
    #expect(card.backgrounds.count == ShareAppearance.variants.count)
    #expect(card.supportsBackground)
    for appearance in ShareAppearance.variants {
      #expect(FileManager.default.fileExists(atPath: card.asset(for: appearance).file.path))
      #expect(coralPixelsInArtwork(card.asset(for: appearance).image) > 100)
    }
    let cancelled = Task { try await ShareCards.prepareInsightCard(data, design: .countries) }
    cancelled.cancel()
    do {
      _ = try await cancelled.value
      Issue.record("Dismissing or swiping away must cancel unused rendering")
    } catch is CancellationError { }
  }

  @MainActor private func coralPixelsInArtwork(_ image: UIImage) -> Int {
    guard let cg = image.cgImage else { return 0 }
    let width = cg.width, height = cg.height
    let bytes = UnsafeMutablePointer<UInt8>.allocate(capacity: width * height * 4)
    defer { bytes.deallocate() }
    guard let context = CGContext(
      data: bytes, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)
    else { return 0 }
    context.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
    var count = 0
    // Exclude the existing coloured footer logo: the artwork itself needs coral.
    for y in 160..<(height - 160) {
      for x in 0..<width {
        let offset = (y * width + x) * 4
        let red = Int(bytes[offset]), green = Int(bytes[offset + 1]), blue = Int(bytes[offset + 2])
        if bytes[offset + 3] > 150 && red > 140 && green < 140 && blue < 150 && red > green + 70 {
          count += 1
        }
      }
    }
    return count
  }

  @Test @MainActor func everyDesignExportsEveryAppearance() throws {
    let data = InsightCardData(stats: stats(), year: 2026, handle: "sillyelphaba", currentYear: 2026)
    // Render every design, including daily streak, independently of eligibility.
    for design in InsightCardDesign.allCases {
      for appearance in ShareAppearance.variants {
        let asset = try ShareCards.render(InsightCardView(design: design, data: data, appearance: appearance), name: "\(design.id)-\(appearance.key)")
        #expect(asset.image.cgImage?.width == 1080)
        #expect(asset.image.cgImage?.height == 1080)
        #expect(coralPixelsInArtwork(asset.image) > 100, "\(design.id) must retain coral in \(appearance.key)")
        if let folder = ProcessInfo.processInfo.environment["STUBBED_CARD_PREVIEWS"] {
          let directory = URL(fileURLWithPath: folder)
          try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
          try asset.image.pngData()!.write(to: directory.appendingPathComponent("\(design.id)-\(appearance.key).png"))
        }
      }
    }
    let allTime = InsightCardData(stats: stats(), year: nil, handle: "ios_test", currentYear: 2026, activityYear: 2024)
    let cards = try ShareCards.insightsCards(allTime)
    #expect(cards.first?.name == "All time in theatre")
    #expect(cards.allSatisfy { $0.supportsBackground })
    #expect(cards.allSatisfy { !$0.showsRating && $0.isInsights })
    #expect(cards.first { $0.id == "activity" }?.file.lastPathComponent.contains("2024") == true)
    #expect(cards.first { $0.id == "year-by-year" }?.file.lastPathComponent.contains("all-time") == true)
  }
}

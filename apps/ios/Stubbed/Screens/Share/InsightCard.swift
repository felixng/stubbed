import Supabase
import SwiftUI
import UIKit

enum InsightCardDesign: String, CaseIterable, Identifiable {
  case year = "year-in-theatre"
  case weekly = "weekly-streak"
  case daily = "daily-streak"
  case bestWeekly = "best-weekly-streak"
  case bestDaily = "best-daily-streak"
  case activity = "activity"
  case repeats = "most-seen-shows"
  case countries = "around-the-world"
  case mix = "show-mix"
  case history = "year-by-year"
  var id: String { rawValue }
  var name: String {
    switch self {
    case .year: "Year in theatre"
    case .weekly: "Weekly streak"
    case .daily: "Daily streak"
    case .bestWeekly: "Best weekly streak"
    case .bestDaily: "Best daily streak"
    case .activity: "Activity"
    case .repeats: "Most-seen shows"
    case .countries: "Around the world"
    case .mix: "Show mix"
    case .history: "Year by year"
    }
  }
  static func available(
    _ stats: InsightStats, year: Int?, currentYear: Int = InsightStats.currentYear,
    activityYear: Int? = nil, includingEmpty: Bool = false
  ) -> [Self] {
    var result: [Self] = []
    if stats.total > 0 || includingEmpty { result.append(.year) }
    if year == nil || year == currentYear {
      if stats.streaks.current_weekly > 0 || includingEmpty { result.append(.weekly) }
      if stats.streaks.current_daily > 0 { result.append(.daily) }
    }
    if stats.total > 0 {
      if stats.streaks.longest_weekly > 0 { result.append(.bestWeekly) }
      if stats.streaks.longest_daily > 0 { result.append(.bestDaily) }
    }
    let calendarYear = year ?? activityYear ?? currentYear
    if stats.days.contains(where: { $0.date.hasPrefix(String(calendarYear)) && $0.count > 0 }) {
      result.append(.activity)
    }
    if !stats.repeated_shows.isEmpty { result.append(.repeats) }
    if !stats.countries.isEmpty { result.append(.countries) }
    if stats.total > 0 || includingEmpty { result.append(.mix) }
    if stats.years.contains(where: { $0.count > 0 }) { result.append(.history) }
    return result
  }
}

enum InsightShareSection: String, CaseIterable, Identifiable {
  case overview, streaks, activity, repeats, countries, mix, history
  var id: String { rawValue }
  var designs: [InsightCardDesign] {
    switch self {
    case .overview: [.year]
    case .streaks: [.weekly, .daily, .bestWeekly, .bestDaily]
    case .activity: [.activity]
    case .repeats: [.repeats]
    case .countries: [.countries]
    case .mix: [.mix]
    case .history: [.history]
    }
  }
}

struct InsightCardData {
  let stats: InsightStats
  let year: Int?
  let handle: String?
  var currentYear = InsightStats.currentYear
  var activityYear: Int?
  var calendarYear: Int { year ?? activityYear ?? currentYear }
  var period: String {
    guard let year else { return "All time" }
    return String(year) + (year == currentYear ? " so far" : "")
  }
  var available: [InsightCardDesign] {
    InsightCardDesign.available(stats, year: year, currentYear: currentYear, activityYear: activityYear)
  }
  func filenamePeriod(for design: InsightCardDesign) -> String {
    switch design {
    case .weekly, .daily: "current"
    case .activity: String(calendarYear)
    case .history: "all-time"
    default: year.map(String.init) ?? "all-time"
    }
  }
}

struct InsightCardView: View {
  let design: InsightCardDesign
  let data: InsightCardData
  var appearance: ShareAppearance = .standard
  private var ink: Color { appearance.foreground }
  private var accent: Color { appearance.statsAccent }
  var body: some View {
    ZStack {
      ShareCardSurface(appearance: appearance)
      VStack(alignment: .leading, spacing: 0) {
        switch design {
        case .year: year
        case .weekly, .daily, .bestWeekly, .bestDaily: streak
        case .activity: ShareActivityCard(data: data, ink: ink, accent: accent)
        case .repeats: ShareRepeatCard(data: data, ink: ink, accent: accent)
        case .countries: ShareCountriesCard(data: data, ink: ink, accent: accent)
        case .mix: mix
        case .history: ShareHistoryCard(data: data, ink: ink, accent: accent)
        }
        Spacer(minLength: 12)
        CardFooter(handle: data.handle, ink: ink)
      }.foregroundStyle(ink).padding(28)
    }.frame(width: 540, height: 540).environment(\.colorScheme, .dark)
  }
  private var streak: some View {
    let weekly = design == .weekly || design == .bestWeekly
    let best = design == .bestWeekly || design == .bestDaily
    let count = best
      ? (weekly ? data.stats.streaks.longest_weekly : data.stats.streaks.longest_daily)
      : (weekly ? data.stats.streaks.current_weekly : data.stats.streaks.current_daily)
    return VStack(alignment: .leading, spacing: 12) {
      Text("\(best ? "Best" : "Current") \(weekly ? "weekly" : "daily") streak")
        .font(.system(size: 30, weight: .bold))
      Text(best ? data.period : "Current · across all years").font(.system(size: 18))
      Spacer(minLength: 12)
      Text(String(count)).font(.system(size: 112, weight: .heavy)).foregroundStyle(accent)
        .tracking(-4).lineLimit(1).minimumScaleFactor(0.45)
      Text(weekly ? (count == 1 ? "Week" : "Weeks") : (count == 1 ? "Day" : "Days"))
        .font(.system(size: 32, weight: .bold))
      Text(count == 0 ? "No current streak" : "A show every \(weekly ? "week" : "day")")
        .font(.system(size: 22, weight: .medium))
      HStack(spacing: 8) {
        ForEach(0..<min(12, count), id: \.self) { _ in
          RoundedRectangle(cornerRadius: 3).fill(accent).frame(width: 28, height: 10)
        }
      }.padding(.top, 12)
      if count > 12 { Text("12 of \(count) \(weekly ? "weeks" : "days") shown").font(.system(size: 15)) }
      Spacer(minLength: 0)
    }
  }
  private var year: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text(data.year.map { "My \(String($0)) in theatre" } ?? "My life in theatre").font(.system(size: 32, weight: .bold))
      if data.year == data.currentYear { Text("So far").font(.system(size: 18)) }
      HStack(spacing: 36) {
        metric(data.stats.total, label: "Show visits")
        metric(data.stats.unique_shows, label: "Unique shows")
      }
      Spacer(minLength: 0)
      if let year = data.year {
        ShareMonthChart(months: data.stats.months, year: year, ink: ink, accent: accent).frame(height: 190)
      } else {
        Text("All time").font(.system(size: 24, weight: .medium))
        ShareYearChart(years: data.stats.years, ink: ink, accent: accent).frame(height: 190)
      }
    }
  }
  private func metric(_ count: Int, label: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(String(count)).font(.system(size: 64, weight: .heavy)).lineLimit(1).minimumScaleFactor(0.5)
      Text(label).font(.system(size: 19, weight: .medium))
    }.frame(maxWidth: .infinity, alignment: .leading)
  }
  private var mix: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("My show mix").font(.system(size: 32, weight: .bold))
      Text("\(data.period) · \(data.stats.total) visits").font(.system(size: 18))
      Spacer(minLength: 0)
      ShareRadar(categories: data.stats.types, total: data.stats.total, ink: ink, accent: accent).frame(height: 310)
    }
  }
}

struct ShareMonthChart: View {
  let months: [InsightStats.Month]
  let year: Int
  let ink: Color
  var accent: Color? = nil
  private let names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  private var counts: [Int] {
    (1...12).map { month in
      months.first { $0.month == String(format: "%04d-%02d", year, month) }?.count ?? 0
    }
  }
  var body: some View {
    GeometryReader { geometry in
      let maxCount = max(1, counts.max() ?? 1)
      let barHeight = geometry.size.height - 50
      HStack(alignment: .bottom, spacing: 6) {
        ForEach(0..<12, id: \.self) { i in
          VStack(spacing: 6) {
            Spacer(minLength: 0)
            Text(String(counts[i])).font(.system(size: 12, weight: .medium)).lineLimit(1).minimumScaleFactor(0.5)
            Rectangle().fill((accent ?? ink).opacity(0.9))
              .frame(height: barHeight * Double(counts[i]) / Double(maxCount))
            Text(names[i]).font(.system(size: 11, weight: .medium))
          }.frame(maxWidth: .infinity)
        }
      }
    }
  }
}

struct ShareRadar: View {
  let categories: [InsightStats.Category]
  let total: Int
  let ink: Color
  var accent: Color? = nil
  private var values: [Double] {
    ShowType.ordered.map { type in Double(categories.first { $0.type == type.rawValue }?.count ?? 0) }
  }
  var body: some View {
    GeometryReader { geometry in
      let center = CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
      let radius = min((geometry.size.width - 180) / 2, (geometry.size.height - 100) / 2)
      let maximum = max(1, values.max() ?? 1)
      ZStack {
        Canvas { context, _ in
          for level in 1...4 {
            context.stroke(polygon(Array(repeating: Double(level) / 4, count: 7), center, radius), with: .color(ink.opacity(0.15)), lineWidth: 1)
          }
          for i in 0..<7 {
            var axis = Path()
            axis.move(to: center)
            axis.addLine(to: point(i, 1, center, radius))
            context.stroke(axis, with: .color(ink.opacity(0.15)), lineWidth: 1)
          }
          let shape = polygon(values.map { $0 / maximum }, center, radius)
          context.fill(shape, with: .color((accent ?? ink).opacity(0.22)))
          context.stroke(shape, with: .color(accent ?? ink), lineWidth: 2)
        }
        ForEach(Array(ShowType.ordered.enumerated()), id: \.offset) { i, type in
          VStack(spacing: 3) {
            Text(type.label).font(.system(size: 15, weight: .medium))
            Text("\(Int(values[i])) · \(total > 0 ? Int((values[i] / Double(total) * 100).rounded()) : 0)%")
              .font(.system(size: 13))
          }.foregroundStyle(ink).frame(width: 126)
            .position(point(i, 1, center, radius + 30))
        }
      }
    }
  }
  private func point(_ i: Int, _ fraction: Double, _ center: CGPoint, _ radius: Double) -> CGPoint {
    let angle = Double(i) / 7 * 2 * .pi - .pi / 2
    return CGPoint(x: center.x + cos(angle) * radius * fraction, y: center.y + sin(angle) * radius * fraction)
  }
  private func polygon(_ fractions: [Double], _ center: CGPoint, _ radius: Double) -> Path {
    var path = Path()
    path.addLines(fractions.enumerated().map { point($0.offset, $0.element, center, radius) })
    path.closeSubpath()
    return path
  }
}

extension ShareCards {
  @MainActor static func showCards(_ data: EntryCardData, photo: UIImage?, insights: InsightCardData) throws -> [RenderedCard] {
    // Keep the show carousel focused; the expanded stats collection lives in Insights.
    try entryCards(data, photo: photo) + insightsCards(
      insights, includingEmpty: true, designs: [.weekly, .year, .mix])
  }
  @MainActor static func insightsCards(
    _ data: InsightCardData, includingEmpty: Bool = false, designs: [InsightCardDesign]? = nil
  ) throws -> [RenderedCard] {
    let available = InsightCardDesign.available(
      data.stats, year: data.year, currentYear: data.currentYear,
      activityYear: data.activityYear, includingEmpty: includingEmpty)
    return try (designs ?? available).filter { available.contains($0) }.map { design in
      let name = "stubbed-\(design.id)-\(data.filenamePeriod(for: design))"
      var variants: [ShareAppearance: ShareAsset] = [:]
      for appearance in ShareAppearance.variants {
        variants[appearance] = try render(InsightCardView(design: design, data: data, appearance: appearance), name: "\(name)-\(appearance.key)")
      }
      let full = variants[.standard]!
      return RenderedCard(id: design.id, name: design == .year && data.year == nil ? "All time in theatre" : design.name, file: full.file, image: full.image, backgrounds: variants, isInsights: true)
    }
  }

  @MainActor static func prepareInsightCard(
    _ data: InsightCardData, design: InsightCardDesign
  ) async throws -> RenderedCard {
    let name = "stubbed-\(design.id)-\(data.filenamePeriod(for: design))"
    var variants: [ShareAppearance: ShareAsset] = [:]
    for appearance in ShareAppearance.variants {
      // Give the sheet/ProgressView a frame between synchronous ImageRenderer
      // passes. Only this design's five variants are needed before sharing.
      try await Task.sleep(for: .milliseconds(1))
      try Task.checkCancellation()
      variants[appearance] = try render(
        InsightCardView(design: design, data: data, appearance: appearance),
        name: "\(name)-\(appearance.key)")
    }
    try Task.checkCancellation()
    let full = variants[.standard]!
    return RenderedCard(
      id: design.id, name: design == .year && data.year == nil ? "All time in theatre" : design.name,
      file: full.file, image: full.image, backgrounds: variants, isInsights: true)
  }

}

struct InsightShareSheet: View {
  let stats: InsightStats
  let year: Int?
  var activityYear: Int? = nil
  var initialDesign: InsightCardDesign? = nil
  var handle: String? = nil
  @State private var cards: [RenderedCard] = []
  @State private var loadedHandle: String?
  @State private var failed = false
  private var designs: [InsightCardDesign] {
    InsightCardDesign.available(stats, year: year, activityYear: activityYear)
  }
  var body: some View {
    ShareScreen {
      if designs.isEmpty {
        ContentUnavailableView("No shows to share", systemImage: "ticket", description: Text("Choose a period with logged shows."))
      } else {
        ShareCarousel(
          subject: .insights, cards: cards, failed: failed, text: "", link: nil,
          initialCardID: initialDesign?.id,
          options: designs.map { ShareCardOption(id: $0.id, name: $0 == .year && year == nil ? "All time in theatre" : $0.name) },
          prepareCard: prepare)
      }
    }
  }

  private func prepare(_ id: String) async {
    guard !cards.contains(where: { $0.id == id }), let design = designs.first(where: { $0.id == id }) else { return }
    failed = false
    do {
      let ownerHandle: String
      if let known = handle ?? loadedHandle {
        ownerHandle = known
      } else {
        let user = try await supabase.auth.session.user
        let profile = try await Profiles.profile(user.id)
        try Task.checkCancellation()
        loadedHandle = profile.handle
        ownerHandle = profile.handle
      }
      let data = InsightCardData(stats: stats, year: year, handle: ownerHandle, activityYear: activityYear)
      let card = try await ShareCards.prepareInsightCard(data, design: design)
      try Task.checkCancellation()
      cards.append(card)
    } catch is CancellationError {
      // Swiping or dismissing cancels unused work, and must not show an error.
    } catch {
      if !Task.isCancelled { failed = true }
    }
  }
}

import Supabase
import SwiftUI
import UIKit

enum InsightCardDesign: String, CaseIterable, Identifiable {
  case weekly = "weekly-streak"
  case year = "year-in-theatre"
  case mix = "show-mix"
  var id: String { rawValue }
  var name: String {
    switch self {
    case .weekly: "Weekly streak"
    case .year: "Year in theatre"
    case .mix: "Show mix"
    }
  }
  static func available(_ stats: InsightStats, year: Int?, currentYear: Int = InsightStats.currentYear, includingEmpty: Bool = false) -> [Self] {
    var result: [Self] = []
    if (year == nil || year == currentYear), (stats.streaks.current_weekly > 0 || includingEmpty) { result.append(.weekly) }
    if stats.total > 0 || includingEmpty {
      if year != nil { result.append(.year) }
      result.append(.mix)
    }
    return result
  }
}

struct InsightCardData {
  let stats: InsightStats
  let year: Int?
  let handle: String?
  var currentYear = InsightStats.currentYear
  var period: String {
    guard let year else { return "All time" }
    return String(year) + (year == currentYear ? " so far" : "")
  }
}

struct InsightCardView: View {
  let design: InsightCardDesign
  let data: InsightCardData
  var appearance: ShareAppearance = .standard
  private var ink: Color { appearance.foreground }
  var body: some View {
    ZStack {
      ShareCardSurface(appearance: appearance)
      VStack(alignment: .leading, spacing: 0) {
        switch design {
        case .weekly: weekly
        case .year: year
        case .mix: mix
        }
        Spacer(minLength: 12)
        CardFooter(handle: data.handle, ink: ink)
      }.foregroundStyle(ink).padding(28)
    }.frame(width: 540, height: 540).environment(\.colorScheme, .dark)
  }
  private var weekly: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Current weekly streak").font(.system(size: 24, weight: .medium))
      Spacer(minLength: 12)
      Text(String(data.stats.streaks.current_weekly)).font(.system(size: 112, weight: .heavy))
        .tracking(-4).lineLimit(1).minimumScaleFactor(0.45)
      Text(data.stats.streaks.current_weekly == 1 ? "Week" : "Weeks").font(.system(size: 32, weight: .bold))
      Text(data.stats.streaks.current_weekly == 0 ? "No current streak" : "A show every week").font(.system(size: 22, weight: .medium))
      HStack(spacing: 8) {
        ForEach(0..<min(12, data.stats.streaks.current_weekly), id: \.self) { _ in
          RoundedRectangle(cornerRadius: 3).fill(ink).frame(width: 28, height: 10)
        }
      }.padding(.top, 12)
      if data.stats.streaks.current_weekly > 12 {
        Text("Most recent 12 weeks").font(.system(size: 15))
      }
      Spacer(minLength: 0)
    }
  }
  private var year: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("My \(String(data.year ?? data.currentYear)) in theatre").font(.system(size: 32, weight: .bold))
      if data.year == data.currentYear { Text("So far").font(.system(size: 18)) }
      HStack(spacing: 36) {
        metric(data.stats.total, label: "Show visits")
        metric(data.stats.unique_shows, label: "Unique shows")
      }
      Spacer(minLength: 0)
      ShareMonthChart(months: data.stats.months, year: data.year ?? data.currentYear, ink: ink)
        .frame(height: 190)
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
      ShareRadar(categories: data.stats.types, total: data.stats.total, ink: ink).frame(height: 310)
    }
  }
}

struct ShareMonthChart: View {
  let months: [InsightStats.Month]
  let year: Int
  let ink: Color
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
            Rectangle().fill(ink.opacity(0.85))
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
          context.fill(shape, with: .color(ink.opacity(0.18)))
          context.stroke(shape, with: .color(ink), lineWidth: 2)
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
    try entryCards(data, photo: photo) + insightsCards(insights, includingEmpty: true)
  }
  @MainActor static func insightsCards(_ data: InsightCardData, includingEmpty: Bool = false) throws -> [RenderedCard] {
    try InsightCardDesign.available(data.stats, year: data.year, currentYear: data.currentYear, includingEmpty: includingEmpty).map { design in
      let name = "stubbed-\(design.id)-\(data.year.map(String.init) ?? "all-time")"
      var variants: [ShareAppearance: ShareAsset] = [:]
      for appearance in ShareAppearance.variants {
        variants[appearance] = try render(InsightCardView(design: design, data: data, appearance: appearance), name: "\(name)-\(appearance.key)")
      }
      let full = variants[.standard]!
      return RenderedCard(id: design.id, name: design.name, file: full.file, image: full.image, backgrounds: variants, isInsights: true)
    }
  }
}

struct InsightShareSheet: View {
  let stats: InsightStats
  let year: Int?
  @State private var cards: [RenderedCard]?
  @State private var failed = false
  var body: some View {
    ShareScreen {
      if cards?.isEmpty == true {
        ContentUnavailableView("No shows to share", systemImage: "ticket", description: Text("Choose a period with logged shows."))
      } else {
        ShareCarousel(subject: .insights, cards: cards, failed: failed, text: "", link: nil)
      }
    }.task {
      do {
        let user = try await supabase.auth.session.user
        let profile = try await Profiles.profile(user.id)
        try Task.checkCancellation()
        cards = try ShareCards.insightsCards(InsightCardData(stats: stats, year: year, handle: profile.handle))
      } catch { if !Task.isCancelled { failed = true } }
    }
  }
}

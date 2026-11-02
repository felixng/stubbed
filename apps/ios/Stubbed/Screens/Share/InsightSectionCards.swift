import SwiftUI

/// Fixed export typography belongs to the square artwork, not the app's controls.
struct ShareActivityCard: View {
  let data: InsightCardData
  let ink: Color
  let accent: Color
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("My theatre calendar").font(.system(size: 32, weight: .bold))
      Text(String(data.calendarYear)).font(.system(size: 20, weight: .medium))
      HStack(alignment: .firstTextBaseline, spacing: 10) {
        Text(String(data.stats.years.first { $0.year == data.calendarYear }?.count ?? 0))
          .font(.system(size: 54, weight: .heavy))
        Text("Show visits").font(.system(size: 20))
      }
      ShareCalendar(year: data.calendarYear, counts: data.stats.activity, ink: ink, accent: accent).frame(height: 96)
      Text("One square per day · stronger colour means more visits").font(.system(size: 14))
      ShareMonthChart(months: data.stats.months, year: data.calendarYear, ink: ink, accent: accent).frame(height: 110)
    }
  }
}

private struct ShareCalendar: View {
  let year: Int
  let counts: [String: Int]
  let ink: Color
  let accent: Color
  var body: some View {
    Canvas { context, size in
      let weeks = ActivityGrid.weeks(year: year)
      let step = size.width / Double(weeks.count)
      let side = step - 2
      let maximum = max(1, counts.filter { $0.key.hasPrefix(String(year)) }.values.max() ?? 1)
      for (column, week) in weeks.enumerated() {
        if let first = week.compactMap({ $0 }).first(where: { $0.hasSuffix("-01") }) {
          let month = Day.date(first).formatted(.dateTime.month(.abbreviated))
          context.draw(Text(month).font(.system(size: 10)).foregroundStyle(ink),
            at: CGPoint(x: Double(column) * step, y: 0), anchor: .topLeading)
        }
        for (row, day) in week.enumerated() {
          guard let day else { continue }
          let count = counts[day] ?? 0
          let rect = CGRect(x: Double(column) * step, y: 22 + Double(row) * step, width: side, height: side)
          context.fill(Path(roundedRect: rect, cornerRadius: 1),
            with: .color(count == 0 ? ink.opacity(0.12) : accent.opacity(0.35 + 0.65 * Double(count) / Double(maximum))))
        }
      }
    }
  }
}

struct ShareRepeatCard: View {
  let data: InsightCardData
  let ink: Color
  let accent: Color
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("My most-seen shows").font(.system(size: 32, weight: .bold))
      Text("\(data.period) · Top \(min(5, data.stats.repeated_shows.count))")
        .font(.system(size: 18))
      Spacer(minLength: 0)
      VStack(spacing: 0) {
        ForEach(data.stats.repeated_shows.prefix(5)) { show in
          HStack(alignment: .firstTextBaseline, spacing: 14) {
            Text(String(show.rank)).font(.system(size: 26, weight: .heavy))
              .monospacedDigit().foregroundStyle(accent).frame(width: 30, alignment: .leading)
            Text(show.title).font(.system(size: 23, weight: .semibold))
              .lineLimit(2).minimumScaleFactor(0.65)
              .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 2) {
              Text(String(show.count)).font(.system(size: 28, weight: .heavy))
              Text("visits").font(.system(size: 13))
            }
          }
          .padding(.vertical, 8)
          if show.id != data.stats.repeated_shows.prefix(5).last?.id {
            Rectangle().fill(ink.opacity(0.18)).frame(height: 1)
          }
        }
      }
      Spacer(minLength: 0)
    }
  }
}

struct ShareCountriesCard: View {
  let data: InsightCardData
  let ink: Color
  let accent: Color
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .top, spacing: 8) {
        VStack(alignment: .leading, spacing: 6) {
          Text("My theatre travels").font(.system(size: 32, weight: .bold))
            .lineLimit(1).minimumScaleFactor(0.8)
          Text(data.period).font(.system(size: 18))
        }
        Spacer(minLength: 0)
        VStack(alignment: .trailing, spacing: 2) {
          Text(String(data.stats.countries.count)).font(.system(size: 40, weight: .heavy))
            .foregroundStyle(accent)
          Text(data.stats.countries.count == 1 ? "Country visited" : "Countries visited")
            .font(.system(size: 13))
        }
      }
      // Let the map's natural aspect ratio use all 484pt of content width.
      // A fixed 170pt height previously constrained it to just 340pt wide.
      CountryHeatmap(countries: data.stats.countries, ink: ink, accent: accent)
        .frame(maxWidth: .infinity)
      VStack(spacing: 6) {
        ForEach(data.stats.countries.prefix(3)) { country in
          HStack {
            Text(country.name).lineLimit(1).minimumScaleFactor(0.7)
            Spacer()
            Text("\(country.count) \(country.count == 1 ? "visit" : "visits")")
          }.font(.system(size: 18, weight: .medium))
        }
      }
      if data.stats.unlocated > 0 {
        Text("\(data.stats.unlocated) visits without a country").font(.system(size: 13))
      }
    }
  }
}

struct ShareHistoryCard: View {
  let data: InsightCardData
  let ink: Color
  let accent: Color
  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      Text("My theatre years").font(.system(size: 32, weight: .bold))
      Text("All time").font(.system(size: 18))
      HStack(alignment: .firstTextBaseline, spacing: 10) {
        Text(String(data.stats.years.count)).font(.system(size: 54, weight: .heavy))
        Text(data.stats.years.count == 1 ? "Year of theatre" : "Years of theatre")
          .font(.system(size: 20))
      }
      Spacer(minLength: 0)
      ShareYearChart(years: data.stats.years, ink: ink, accent: accent).frame(height: 230)
    }
  }
}

struct ShareYearChart: View {
  let years: [InsightStats.Year]
  let ink: Color
  var accent: Color? = nil
  private var chronological: [InsightStats.Year] { years.sorted { $0.year < $1.year } }
  var body: some View {
    GeometryReader { geometry in
      let items = chronological
      let maximum = max(1, items.map(\.count).max() ?? 1)
      // Each bar is a calendar year; gaps are left empty, not compressed away.
      let first = items.first?.year ?? 0
      let last = items.last?.year ?? first
      let span = max(1, last - first + 1)
      let step = geometry.size.width / Double(span)
      let labelInterval = max(1, Int(ceil(Double(span) / 6)))
      ZStack(alignment: .topLeading) {
        ForEach(items) { item in
          let height = (geometry.size.height - 48) * Double(item.count) / Double(maximum)
          let x = Double(item.year - first) * step
          Rectangle().fill((accent ?? ink).opacity(0.9))
            .frame(width: max(1, step - min(8, step / 4)), height: height)
            .offset(x: x, y: geometry.size.height - 26 - height)
          if span <= 12 {
            Text(String(item.count)).font(.system(size: 13, weight: .medium))
              .frame(width: step).offset(x: x, y: geometry.size.height - 48 - height)
          }
          if item.year == first || item.year == last || ((item.year - first).isMultiple(of: labelInterval) && last - item.year >= labelInterval) {
            Text(String(item.year)).font(.system(size: 12))
              .lineLimit(1).minimumScaleFactor(0.6)
              .frame(width: max(step, 32), alignment: .leading)
              .offset(x: min(x, geometry.size.width - 32), y: geometry.size.height - 18)
          }
        }
      }
    }
  }
}

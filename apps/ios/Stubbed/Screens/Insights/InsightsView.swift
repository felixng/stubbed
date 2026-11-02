import Charts
import SwiftUI

struct InsightsView: View {
  @Environment(AppRouter.self) private var router
  @Environment(\.dynamicTypeSize) private var typeSize
  @State private var year: Int? = InsightStats.currentYear
  @State private var gridYear = InsightStats.currentYear
  @State private var stats: InsightStats?
  @State private var years: [Int] = [InsightStats.currentYear]
  @State private var error: String?
  @State private var sharing = false

  var body: some View {
    List {
      Section {
        Picker("Year", selection: $year) {
          ForEach(years, id: \.self) { Text(String($0)).tag(Optional($0)) }
          Text("All time").tag(Int?.none)
        }
        .accessibilityIdentifier("insights-year")
      }
      if let stats {
        overview(stats)
        repeatedShows(stats)
        streaks(stats)
        activity(stats)
        geography(stats)
        categories(stats)
        history(stats)
      } else if let error {
        ContentUnavailableView {
          Label("Couldn’t load Insights", systemImage: "wifi.exclamationmark")
        } description: {
          Text(error)
        } actions: {
          Button("Try again") { Task { await load() } }.buttonStyle(.bordered)
        }
      } else {
        PlaceholderRows(count: 4)
      }
    }
    .listStyle(.insetGrouped)
    .tabBarClearance()
    .navigationTitle("Insights")
    .navigationBarTitleDisplayMode(.large)
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        if let stats {
          Button("Share", systemImage: "square.and.arrow.up") { sharing = true }
            .disabled(InsightCardDesign.available(stats, year: year).isEmpty)
            .accessibilityIdentifier("insights-share")
        }
      }
    }
    .sheet(isPresented: $sharing) {
      if let stats { InsightShareSheet(stats: stats, year: year) }
    }
    .task(id: "\(year ?? 0)-\(router.dataVersion)") { await load() }
    .refreshable { await load() }
  }

  private func overview(_ stats: InsightStats) -> some View {
    Section {
      VStack(alignment: .leading, spacing: Space.s) {
        Text(stats.total.formatted()).font(.largeTitle.bold()).monospacedDigit()
        Text(verbatim: year.map { "Shows in \(String($0))" } ?? "Shows, all time").font(.headline)
        Text("\(stats.unique_shows) unique shows · repeat visits included")
          .font(.footnote).foregroundStyle(.secondary)
      }
      .padding(.vertical, Space.s)
      if let year, let previous = stats.years.first(where: { $0.year == year - 1 }) {
        LabeledContent("Previous full year (\(String(year - 1)))", value: "\(previous.count) shows")
      }
    } footer: {
      Text("Your logged shows, including private entries. Planned shows aren’t counted.")
    }
  }

  private func repeatedShows(_ stats: InsightStats) -> some View {
    Section {
      if stats.repeated_shows.isEmpty {
        ContentUnavailableView(
          "No repeat visits yet", systemImage: "repeat",
          description: Text("Shows you’ve seen more than once in this period will appear here."))
      } else {
        ForEach(stats.repeated_shows) { show in
          NavigationLink(
            value: AppRouter.Route.insightVisits(
              Insights.Filter(year: year, show: show.id, title: show.title))
          ) {
            HStack(alignment: .firstTextBaseline, spacing: Space.m) {
              Text(show.rank.formatted())
                .font(.headline).monospacedDigit().foregroundStyle(Palette.tint)
                .accessibilityHidden(true)
              LabeledContent {
                Text("\(show.count) visits").monospacedDigit()
              } label: {
                Text(show.title)
              }
            }
          }
          .accessibilityLabel("Rank \(show.rank), \(show.title), \(show.count) visits")
          .accessibilityIdentifier("insights-repeat-\(show.id.uuidString.lowercased())")
        }
      }
    } header: {
      Text("Most-seen shows")
    } footer: {
      if !stats.repeated_shows.isEmpty {
        Text("Ranked by visits in the selected period. Equal counts share a rank. Tap a show to see your visits.")
      }
    }
  }

  private func activity(_ stats: InsightStats) -> some View {
    Section {
      if year == nil {
        Picker("Activity year", selection: $gridYear) {
          ForEach(years, id: \.self) { Text(String($0)).tag($0) }
        }
      }
      ActivityHeatmap(year: year ?? gridYear, counts: stats.activity) { day in
        router.open(.insightVisits(Insights.Filter(day: day, title: Day.format(day))))
      }
      .id(year ?? gridYear)
      if !stats.months.isEmpty {
        Chart(stats.months.filter { $0.month.hasPrefix(String(year ?? gridYear)) }) { month in
          BarMark(
            x: .value("Month", Day.date(month.month + "-01"), unit: .month),
            y: .value("Shows", month.count)
          )
          .foregroundStyle(Palette.tint)
        }
        .chartXAxis {
          AxisMarks(values: .stride(by: .month, count: 3)) { _ in
            AxisValueLabel(format: .dateTime.month(.abbreviated))
          }
        }
        .frame(height: 140)
        .accessibilityLabel("Monthly show counts")
        DisclosureGroup("Monthly totals") {
          ForEach(stats.months.filter { $0.month.hasPrefix(String(year ?? gridYear)) }) { month in
            LabeledContent(
              Day.date(month.month + "-01").formatted(.dateTime.month(.wide)),
              value: month.count.formatted())
          }
        }
      }
    } header: {
      Text("Activity · \(String(year ?? gridYear))")
    }
  }

  private func streaks(_ stats: InsightStats) -> some View {
    Section {
      LazyVGrid(
        columns: Array(repeating: GridItem(.flexible(), alignment: .topLeading),
          count: typeSize.isAccessibilitySize ? 1 : 2), spacing: Space.l
      ) {
        if year == nil || year == InsightStats.currentYear {
          streakTile("Current weekly streak", count: stats.streaks.current_weekly, unit: "week")
            .accessibilityIdentifier("insights-current-weekly")
          streakTile("Current daily streak", count: stats.streaks.current_daily, unit: "day")
        }
        streakTile("Longest weekly streak", count: stats.streaks.longest_weekly, unit: "week")
        streakTile("Longest daily streak", count: stats.streaks.longest_daily, unit: "day")
      }
      .padding(.vertical, Space.s)
    } header: {
      Text("Streaks")
    } footer: {
      Text(
        "A show each day or each Monday–Sunday week. An unfinished day or week doesn’t break your current streak. Best streaks are for the selected period."
      )
    }
  }

  private func streakTile(_ title: String, count: Int, unit: String) -> some View {
    VStack(alignment: .leading, spacing: Space.s) {
      Text(streakLabel(count, unit: unit)).font(.title2.bold()).monospacedDigit()
      Text(title).font(.footnote).foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(Space.m)
    .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: Radius.md))
    .accessibilityElement(children: .combine)
  }

  private func geography(_ stats: InsightStats) -> some View {
    Section {
      if stats.countries.isEmpty {
        ContentUnavailableView(
          "No locations yet", systemImage: "globe",
          description: Text("Add a theatre with a country to place your shows on the map."))
      } else {
        LabeledContent("Countries visited", value: stats.countries.count.formatted())
          .accessibilityIdentifier("insights-countries-count")
        CountryHeatmap(countries: stats.countries)
        ForEach(stats.countries) { country in
          NavigationLink(
            value: AppRouter.Route.insightVisits(
              Insights.Filter(year: year, country: country.country, title: country.name))
          ) {
            LabeledContent(country.name, value: showCount(country.count))
          }
        }
      }
    } header: {
      Text("Around the world")
    } footer: {
      Text(
        "Darker countries mean more visits. \(stats.unlocated) shows have no country. Some small countries appear in the list only."
      )
    }
  }

  private func categories(_ stats: InsightStats) -> some View {
    Section {
      if stats.total == 0 {
        ContentUnavailableView(
          "Your mix starts here", systemImage: "chart.pie",
          description: Text("Log a show to see your favourite show types."))
      } else {
        CategoryRadar(categories: stats.types)
        ForEach(ShowType.ordered, id: \.rawValue) { type in
          let count = stats.types.first { $0.type == type.rawValue }?.count ?? 0
          NavigationLink(
            value: AppRouter.Route.insightVisits(
              Insights.Filter(year: year, type: type.rawValue, title: type.label))
          ) {
            LabeledContent(
              type.label,
              value:
                "\(count) · \((Double(count) / Double(stats.total)).formatted(.percent.precision(.fractionLength(0))))"
            )
          }
          .accessibilityIdentifier("insights-type-\(type.rawValue)")
        }
      }
    } header: {
      Text("Your show mix")
    } footer: {
      Text(
        "Each visit counts once in its show’s category. The outer ring represents your most-seen type; percentages are listed above."
      )
    }
  }

  private func history(_ stats: InsightStats) -> some View {
    Section("Year by year") {
      if stats.years.isEmpty {
        Text("Your history appears after your first logged show.").foregroundStyle(.secondary)
      }
      ForEach(stats.years) { item in
        Button {
          year = item.year
        } label: {
          LabeledContent(String(item.year), value: showCount(item.count))
        }
        .foregroundStyle(.primary)
      }
    }
  }

  private func streakLabel(_ count: Int, unit: String) -> String {
    "\(count) \(unit)\(count == 1 ? "" : "s")"
  }

  private func showCount(_ count: Int) -> String {
    "\(count) \(count == 1 ? "show" : "shows")"
  }

  private func load() async {
    let requested = year
    stats = nil
    error = nil
    do {
      let result = try await Insights.load(year: requested)
      try Task.checkCancellation()
      let earliest = min(
        result.years.map(\.year).min() ?? InsightStats.currentYear, InsightStats.currentYear)
      let latest = max(
        result.years.map(\.year).max() ?? InsightStats.currentYear, InsightStats.currentYear)
      years = Array((earliest...latest).reversed())
      stats = result
    } catch is CancellationError {} catch {
      if !Task.isCancelled { self.error = "Check your connection and try again." }
    }
  }
}

struct InsightVisitsView: View {
  let filter: Insights.Filter
  @Environment(AppRouter.self) private var router
  @State private var visits: [Insights.Visit] = []
  @State private var loading = true
  @State private var more = false
  @State private var error: String?

  var body: some View {
    List {
      ForEach(visits) { visit in
        NavigationLink(value: AppRouter.Route.entry(visit.id)) {
          VStack(alignment: .leading, spacing: Space.xs) {
            Text(visit.title).font(.headline)
            Text([Day.format(visit.date), visit.venue].compactMap { $0 }.joined(separator: " · "))
              .font(.subheadline).foregroundStyle(.secondary)
            if let rating = visit.rating { RatingStars(value: rating) }
          }
          .padding(.vertical, Space.xs)
        }
      }
      if loading { PlaceholderRows(count: 2) }
      if let error {
        Text(error).foregroundStyle(.secondary)
        Button("Try again") { Task { await load(reset: visits.isEmpty) } }
      } else if !loading && visits.isEmpty {
        ContentUnavailableView(
          "No shows here yet", systemImage: "ticket",
          description: Text("Only logged visits appear in Insights."))
      }
      if more && !loading { Button("Load more") { Task { await load(reset: false) } } }
    }
    .listStyle(.insetGrouped)
    .tabBarClearance()
    .navigationTitle(filter.title)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: router.dataVersion) { await load(reset: true) }
    .refreshable { await load(reset: true) }
  }

  private func load(reset: Bool) async {
    loading = true
    error = nil
    do {
      let page = try await Insights.visits(filter, offset: reset ? 0 : visits.count)
      try Task.checkCancellation()
      visits = reset ? page : visits + page
      more = page.count == 100
    } catch { if !Task.isCancelled { self.error = "Couldn’t load these shows. Try again." } }
    loading = false
  }
}

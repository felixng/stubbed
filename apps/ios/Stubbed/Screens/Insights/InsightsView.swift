import Charts
import SwiftUI

struct InsightsView: View {
  @Environment(AppRouter.self) private var router
  @Environment(AppSession.self) private var session
  @Environment(Membership.self) private var membership
  @Environment(PaywallRouter.self) private var paywall
  @Environment(\.dynamicTypeSize) private var typeSize
  @ScaledMetric(relativeTo: .body) private var monthlyChartHeight: CGFloat = 140
  @State private var year: Int? = InsightStats.currentYear
  @State private var gridYear = InsightStats.currentYear
  @State private var stats: InsightStats?
  @State private var shareHandle: String?
  @State private var years: [Int] = [InsightStats.currentYear]
  @State private var error: String?
  @State private var lockedPeriodNote = false
  @State private var choosingPeriod = false
  @State private var shareRequest: ShareRequest?
  private struct ShareRequest: Identifiable {
    let id = UUID()
    let design: InsightCardDesign?
  }

  var body: some View {
    List {
      Section {
        Button {
          choosingPeriod = true
        } label: {
          HStack(spacing: Space.xs) {
            Text(verbatim: year.map(String.init) ?? "All time").font(.title2.bold())
            Image(systemName: "chevron.down").font(.footnote.weight(.bold)).foregroundStyle(.secondary)
          }
          .frame(minHeight: Space.touch, alignment: .leading)
          .contentShape(.rect)
        }
        .foregroundStyle(.primary)
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 0, leading: Space.s, bottom: 0, trailing: Space.l))
        .accessibilityLabel("Time period")
        .accessibilityValue(year.map(String.init) ?? "All time")
        .accessibilityHint("Choose a year or All time")
        .accessibilityIdentifier("insights-year")
        if lockedPeriodNote {
          ProNote()
        }
      }
      if let stats, stats.isLocked("total") {
        Section {
          ProBanner(source: year == nil ? .allTime : .pastYear)
        }
      } else if let stats {
        overview(stats)
        streaks(stats)
        activity(stats)
        repeatedShows(stats)
        geography(stats)
        categories(stats)
        history(stats)
        upgrade(stats)
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
          Button("Share", systemImage: "square.and.arrow.up") { shareRequest = ShareRequest(design: nil) }
            .disabled(InsightCardDesign.available(stats, year: year, activityYear: gridYear).isEmpty)
            .accessibilityIdentifier("insights-share")
        }
      }
    }
    .sheet(isPresented: $choosingPeriod) {
      PeriodSheet(
        year: year, years: years,
        counts: Dictionary(uniqueKeysWithValues: (stats?.years ?? []).map { ($0.year, $0.count) }),
        showsEarlierYears: !membership.canUse("insights.past_years"),
        pick: choosePeriod)
    }
    .sheet(item: $shareRequest) { request in
      if let stats {
        InsightShareSheet(stats: stats, year: year, activityYear: gridYear, initialDesign: request.design, handle: shareHandle)
      }
    }
    .task(id: "\(year ?? 0)-\(router.dataVersion)-\(membership.version)") { await load() }
    .refreshable { await load() }
    .task(id: "\(session.userId?.uuidString ?? "")-\(router.dataVersion)") {
      // Fetch the footer handle while browsing Insights rather than after Share.
      shareHandle = nil
      if let id = session.userId {
        do {
          let profile = try await Profiles.profile(id)
          try Task.checkCancellation()
          shareHandle = profile.handle
        } catch { /* Sharing can retry the profile read if this prefetch fails. */ }
      }
    }
  }

  /// Choosing a period the plan doesn't include opens the paywall and keeps the current one;
  /// after a confirmed upgrade the paywall's resume closure selects what was asked for.
  private var yearSelection: Binding<Int?> {
    Binding(get: { year }, set: { _ = choosePeriod($0) })
  }

  /// Picks a period, or opens the paywall for one the plan lacks. Returns true when the period
  /// sheet should close (it was selected, or there's no paywall to open and a note explains).
  private func choosePeriod(_ new: Int?) -> Bool {
    if canUse(year: new) {
      year = new
      lockedPeriodNote = false
      return true
    } else if membership.salesEnabled {
      paywall.present(source: new == nil ? .allTime : .pastYear) { year = new }
      return false
    } else {
      lockedPeriodNote = true
      return true
    }
  }

  private func canUse(year: Int?) -> Bool {
    membership.canUse(
      year == nil ? "insights.all_time"
        : year == InsightStats.currentYear ? "insights.current_year" : "insights.past_years")
  }

  private func overview(_ stats: InsightStats) -> some View {
    Section {
      VStack(alignment: .leading, spacing: Space.s) {
        HStack(alignment: .top) {
          Text(stats.total.formatted()).font(.largeTitle.bold()).monospacedDigit()
          Spacer()
          shareButton(.overview, title: "overview", stats: stats)
        }
        HStack(spacing: Space.xs) {
          Text(verbatim: year.map { "Shows in \(String($0))" } ?? "Shows, all time").font(.headline)
          InsightInfoButton(
            title: "Overview",
            message: "Your logged shows, including private entries. Planned shows aren’t counted.")
        }
        Text("\(stats.unique_shows) unique shows · repeat visits included")
          .font(.footnote).foregroundStyle(.secondary)
      }
      .padding(.vertical, Space.s)
      if let year, let previous = stats.years.first(where: { $0.year == year - 1 }) {
        LabeledContent("Previous full year (\(String(year - 1)))", value: "\(previous.count) shows")
      }
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
      sectionHeading(
        "Most-seen shows", section: .repeats, stats: stats,
        info: "Ranked by visits in the selected period. Equal counts share a rank. Tap a show to see your visits.")
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
        .frame(height: monthlyChartHeight)
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
      sectionHeading("Activity · \(String(year ?? gridYear))", section: .activity, stats: stats)
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
      sectionHeading(
        "Streaks", section: .streaks, stats: stats,
        info: "A show each day or each Monday–Sunday week. An unfinished day or week doesn’t break your current streak. Best streaks are for the selected period.")
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
      sectionHeading(
        "Around the world", section: .countries, stats: stats,
        info: "Darker countries mean more visits. \(stats.unlocated) shows have no country. Some small countries appear in the list only.")
    }
  }

  private func categories(_ stats: InsightStats) -> some View {
    Section {
      if stats.isLocked("types") {
        ProNote()
      } else if stats.total == 0 {
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
      sectionHeading(
        "Your show mix", section: .mix, stats: stats,
        info: "Each visit counts once in its show’s category. The outer ring represents your most-seen type; percentages are listed in the tile.")
    }
  }

  /// The one upgrade banner, after the last section, when anything on this screen is locked.
  @ViewBuilder
  private func upgrade(_ stats: InsightStats) -> some View {
    if stats.isLocked("types") {
      Section { ProBanner(source: .showMix, resume: { year = InsightStats.currentYear }) }
    } else if stats.isLocked("years") {
      Section { ProBanner(source: .pastYear) }
    }
  }

  private func history(_ stats: InsightStats) -> some View {
    Section {
      if stats.isLocked("years") {
        ProNote()
      } else if stats.years.isEmpty {
        Text("Your history appears after your first logged show.").foregroundStyle(.secondary)
      }
      ForEach(stats.years) { item in
        Button {
          yearSelection.wrappedValue = item.year
        } label: {
          LabeledContent(String(item.year), value: showCount(item.count))
        }
        .foregroundStyle(.primary)
      }
    } header: {
      sectionHeading("Year by year", section: .history, stats: stats)
    }
  }

  private func sectionHeading(
    _ title: String, section: InsightShareSection, stats: InsightStats, info: String? = nil
  ) -> some View {
    HStack(spacing: Space.xs) {
      Text(title).fixedSize(horizontal: false, vertical: true)
      if let info { InsightInfoButton(title: title, message: info) }
      Spacer(minLength: Space.s)
      shareButton(section, title: title, stats: stats)
    }
  }

  @ViewBuilder
  private func shareButton(_ section: InsightShareSection, title: String, stats: InsightStats) -> some View {
    let available = InsightCardDesign.available(stats, year: year, activityYear: gridYear)
    if let design = section.designs.first(where: { available.contains($0) }) {
      Button {
        shareRequest = ShareRequest(design: design)
      } label: {
        Label("Share \(title)", systemImage: "square.and.arrow.up")
          .labelStyle(.iconOnly)
          .font(.body)
          .frame(minWidth: Space.touch, minHeight: Space.touch)
          .contentShape(.rect)
      }
      .foregroundStyle(Palette.tint)
      .buttonStyle(.borderless)
      .textCase(nil)
      .accessibilityIdentifier("insights-share-\(section.id)")
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

private struct InsightInfoButton: View {
  let title: String
  let message: String
  @State private var isPresented = false

  var body: some View {
    Button {
      isPresented = true
    } label: {
      Image(systemName: "info.circle")
        .font(.body)
        .frame(minWidth: Space.touch, minHeight: Space.touch)
        .contentShape(.rect)
    }
    .buttonStyle(.borderless)
    .foregroundStyle(.secondary)
    .textCase(nil)
    .accessibilityLabel("About \(title)")
    .popover(isPresented: $isPresented) {
      ScrollView {
        Text(message)
          .font(.body)
          .padding(Space.l)
      }
      .frame(idealWidth: 320, idealHeight: 200)
      .presentationCompactAdaptation(.popover)
    }
  }
}

struct InsightVisitsView: View {
  let filter: Insights.Filter
  @Environment(AppRouter.self) private var router
  @Environment(Membership.self) private var membership
  @Environment(PaywallRouter.self) private var paywall
  @State private var visits: [Insights.Visit] = []
  @State private var loading = true
  @State private var more = false
  @State private var error: String?
  @State private var locked = false

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
      if locked {
        ContentUnavailableView {
          Label("Part of \(membership.name)", systemImage: "lock.fill")
        } description: {
          Text(filter.type != nil ? "Show mix is part of \(membership.name)." : "Earlier years and All time are part of \(membership.name).")
        } actions: {
          if membership.salesEnabled {
            Button("Upgrade") { presentPaywall() }.buttonStyle(.borderedProminent)
          }
        }
      } else if let error {
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
    .task(id: "\(router.dataVersion)-\(membership.version)") { await load(reset: true) }
    .refreshable { await load(reset: true) }
  }

  private func presentPaywall() {
    let source: PaywallRouter.Source = filter.type != nil ? .showMix : filter.year == nil ? .allTime : .pastYear
    paywall.present(source: source)
  }

  private func load(reset: Bool) async {
    loading = true
    error = nil
    locked = false
    do {
      let page = try await Insights.visits(filter, offset: reset ? 0 : visits.count)
      try Task.checkCancellation()
      visits = reset ? page : visits + page
      more = page.count == 100
    } catch {
      if Insights.isUpgradeRequired(error) {
        // A locked filter opens the paywall, not an error message.
        locked = true
        visits = []
        if membership.salesEnabled { presentPaywall() }
      } else if !Task.isCancelled {
        self.error = "Couldn’t load these shows. Try again."
      }
    }
    loading = false
  }
}

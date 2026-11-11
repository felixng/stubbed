import SwiftUI

/// Owner-only summary; never reused by the public profile.
struct ProfileInsightsSection: View {
  var refreshVersion = 0
  var tripCount = 0
  @Environment(AppRouter.self) private var router
  @Environment(Membership.self) private var membership
  @State private var current: InsightStats?
  @State private var failed = false

  var body: some View {
    Group {
      yearSection
      // The upgrade banner is its own container under the year, as wide as the others.
      if membership.isFree, membership.salesEnabled {
        Section { ProBanner(source: .profile) }
      }
    }
  }

  private var yearSection: some View {
    Section {
      if let current {
        VStack(alignment: .leading, spacing: Space.l) {
          ProfileYearMetrics(
            shows: current.total, weekly: current.streaks.current_weekly,
            best: current.streaks.longest_weekly)
          ActivityHeatmap(year: InsightStats.currentYear, counts: current.activity) { day in
            router.open(.insightVisits(Insights.Filter(day: day, title: Day.format(day))))
          }
        }
        .padding(.vertical, Space.s)
      } else if failed {
        Text("Your stats couldn’t load.").foregroundStyle(.secondary)
        Button("Try again") { Task { await load() } }
      } else {
        PlaceholderRows(count: 1)
      }
      // Members see their plan; Free members get the banner in its own section below.
      if membership.isPro {
        HStack {
          Label("\(membership.name) member", systemImage: "checkmark.seal.fill")
            .foregroundStyle(Palette.tintText)
            .accessibilityIdentifier("profile-pro-member")
          Spacer()
          ManageMembershipButton().buttonStyle(.borderless)
        }
      }
      // Router buttons avoid duplicate pushes inside Profile's selection List.
      destination("Trips", systemImage: "suitcase", route: .trips, count: tripCount)
        .accessibilityIdentifier("profile-trips")
      destination("Insights", systemImage: "chart.xyaxis.line", route: .insights)
        .accessibilityIdentifier("profile-insights")
    } header: {
      ProfileYearHeading(year: InsightStats.currentYear)
        .accessibilityIdentifier("profile-year-header")
    }
    .selectionDisabled()
    .task(id: "\(router.dataVersion)-\(refreshVersion)-\(membership.version)") { await load() }
  }

  private func destination(
    _ title: String, systemImage: String, route: AppRouter.Route, count: Int? = nil
  ) -> some View {
    Button { router.open(route) } label: {
      HStack {
        Label(title, systemImage: systemImage)
        Spacer()
        if let count { Text(count.formatted()).foregroundStyle(.secondary) }
        Image(systemName: "chevron.right").font(.footnote).foregroundStyle(.tertiary)
      }
      .contentShape(.rect)
    }
    .foregroundStyle(.primary)
    .alignmentGuide(.listRowSeparatorLeading) { _ in 0 }
  }

  private func load() async {
    failed = false
    do {
      let result = try await Insights.load(year: InsightStats.currentYear)
      try Task.checkCancellation()
      current = result
    } catch { if !Task.isCancelled && current == nil { failed = true } }
  }
}

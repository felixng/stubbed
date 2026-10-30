import SwiftUI

/// Owner-only summary; never reused by the public profile.
struct ProfileInsightsSection: View {
  var refreshVersion = 0
  @Environment(AppRouter.self) private var router
  @Environment(\.dynamicTypeSize) private var typeSize
  @State private var current: InsightStats?
  @State private var allTime: InsightStats?
  @State private var failed = false

  var body: some View {
    Section {
      if let current, let allTime {
        VStack(alignment: .leading, spacing: Space.l) {
          let countLayout =
            typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Space.xs))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: Space.s))
          countLayout {
            Text(current.total.formatted()).font(.largeTitle.bold()).monospacedDigit()
            Text("shows in \(String(InsightStats.currentYear))").font(.subheadline).foregroundStyle(
              .secondary)
          }
          if typeSize.isAccessibilitySize {
            streak("Current weekly streak", count: allTime.streaks.current_weekly)
            streak("Longest weekly streak · all time", count: allTime.streaks.longest_weekly)
          } else {
            HStack(alignment: .top, spacing: Space.l) {
              streak("Current weekly streak", count: allTime.streaks.current_weekly)
              streak("Longest weekly streak · all time", count: allTime.streaks.longest_weekly)
            }
          }
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
      // Profile is List(selection:); router buttons avoid its double-push bug.
      Button {
        router.open(.insights)
      } label: {
        HStack {
          Label("Insights", systemImage: "chart.xyaxis.line")
          Spacer()
          Image(systemName: "chevron.right").font(.footnote).foregroundStyle(.tertiary)
        }
        .frame(minHeight: Space.touch)
        .contentShape(.rect)
      }
      .foregroundStyle(.primary)
      .accessibilityIdentifier("profile-insights")
    } header: {
      Text("Your theatre life")
    }
    .selectionDisabled()
    .task(id: "\(router.dataVersion)-\(refreshVersion)") { await load() }
  }

  private func streak(_ title: String, count: Int) -> some View {
    VStack(alignment: .leading, spacing: Space.xs) {
      Text("\(count) \(count == 1 ? "week" : "weeks")").font(.title3.bold()).monospacedDigit()
      Text(title).font(.footnote).foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }

  private func load() async {
    failed = false
    do {
      async let year = Insights.load(year: InsightStats.currentYear)
      async let lifetime = Insights.load(year: nil)
      let result = try await (year, lifetime)
      try Task.checkCancellation()
      current = result.0
      allTime = result.1
    } catch { if !Task.isCancelled && current == nil { failed = true } }
  }
}

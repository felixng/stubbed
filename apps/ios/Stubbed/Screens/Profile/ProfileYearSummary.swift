import SwiftUI

/// Shared presentation only; each profile supplies its own visibility-safe data.
struct ProfileYearHeading: View {
  let year: Int
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    let layout = typeSize.isAccessibilitySize
      ? AnyLayout(VStackLayout(alignment: .leading, spacing: Space.s))
      : AnyLayout(HStackLayout(spacing: Space.s))
    layout {
      Text(String(year)).font(.title3.bold())
      Text("IN PROGRESS")
        .font(.caption2.weight(.semibold))
        .padding(.horizontal, Space.s)
        .padding(.vertical, Space.xs)
        .background(.quaternary, in: .capsule)
    }
    .foregroundStyle(.primary)
    .textCase(nil)
    .accessibilityElement(children: .combine)
  }
}

struct ProfileYearMetrics: View {
  let shows: Int
  let weekly: Int
  let best: Int
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    let layout = typeSize.isAccessibilitySize
      ? AnyLayout(VStackLayout(alignment: .leading, spacing: Space.m))
      : AnyLayout(HStackLayout(alignment: .top, spacing: Space.m))
    layout {
      metric("Shows", value: shows.formatted())
      metric("Weekly streak", value: weeks(weekly))
      metric("Best this year", value: weeks(best))
    }
  }

  private func metric(_ title: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: Space.xs) {
      Text(value).font(.title3.bold()).monospacedDigit()
      Text(title).font(.footnote).foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }

  private func weeks(_ count: Int) -> String {
    "\(count) \(count == 1 ? "week" : "weeks")"
  }
}

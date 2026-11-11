import SwiftUI

/// The Insights "Time period" sheet (#497), after the year sheet in Personal Best: one row per
/// period, a check on the current one, and a Pro pill on the ones the plan doesn't include.
/// A locked row opens the paywall on top of this sheet, so closing the paywall leaves the person
/// here; once Pro is confirmed the paywall's resume picks the period and the sheet closes.
/// A Free caller's Insights carry no earlier years (listing them would reveal them), so the sheet
/// offers one "Earlier years" row between this year and All time.
struct PeriodSheet: View {
  let year: Int?
  let years: [Int]
  /// Shows per year, when the plan includes the history.
  let counts: [Int: Int]
  /// True when a Free member should see one row standing for the years before this one.
  let showsEarlierYears: Bool
  /// Picks a period. Returns true when the sheet should close (selected, or nothing to open).
  let pick: (Int?) -> Bool
  @Environment(Membership.self) private var membership
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      List {
        ForEach(years, id: \.self) { item in
          row(
            title: String(item), detail: counts[item].map(showCount), value: item,
            locked: !canUse(item))
        }
        if showsEarlierYears {
          row(
            title: "Earlier years", detail: "Look back at every year",
            value: InsightStats.currentYear - 1, locked: true, id: "earlier")
        }
        row(
          title: "All time", detail: "Every show you’ve logged", value: nil,
          locked: !canUse(nil))
      }
      .listStyle(.insetGrouped)
      .navigationTitle("Time period")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Close", systemImage: "xmark") { dismiss() }
            .accessibilityIdentifier("period-close")
        }
      }
      // Picking from the paywall (after upgrading) changes the year and closes this sheet.
      .onChange(of: year) { dismiss() }
    }
    .paywallHost()
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
    .accessibilityIdentifier("period-sheet")
  }

  private func row(
    title: String, detail: String?, value: Int?, locked: Bool, id: String? = nil
  ) -> some View {
    let selected = !locked && value == year && id == nil
    return Button {
      if pick(value) { dismiss() }
    } label: {
      HStack(spacing: Space.m) {
        VStack(alignment: .leading, spacing: Space.xs) {
          Text(title).font(.headline)
          if let detail { Text(detail).font(.footnote).foregroundStyle(.secondary) }
        }
        Spacer(minLength: Space.s)
        if locked {
          Label(membership.name, systemImage: "lock.fill")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Palette.tintText)
            .padding(.horizontal, Space.m).padding(.vertical, Space.xs)
            .background(Palette.tintFill, in: Capsule())
        } else if selected {
          Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Palette.tintText)
        }
      }
      .frame(minHeight: Space.touch)
      .contentShape(.rect)
    }
    .foregroundStyle(.primary)
    .accessibilityLabel(title)
    .accessibilityValue(locked ? "Part of \(membership.name)" : (selected ? "Selected" : ""))
    .accessibilityAddTraits(selected ? .isSelected : [])
    .accessibilityIdentifier("period-\(id ?? (value.map(String.init) ?? "all"))")
  }

  private func canUse(_ year: Int?) -> Bool {
    membership.canUse(
      year == nil ? "insights.all_time"
        : year == InsightStats.currentYear ? "insights.current_year" : "insights.past_years")
  }

  private func showCount(_ count: Int) -> String { "\(count) \(count == 1 ? "show" : "shows")" }
}

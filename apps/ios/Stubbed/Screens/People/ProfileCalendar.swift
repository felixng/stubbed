import SwiftUI

/// A month at a time, Monday first, like the web's (and Hevy's) calendar.
/// Days with a show are filled with the tint; tapping one jumps to that
/// day's show in the list. Opens on the month of the latest show.
struct ProfileCalendar: View {
  struct Item: Hashable {
    let id: UUID
    let date: String
    let title: String
  }

  /// Newest first.
  let entries: [Item]
  let onSelect: (UUID) -> Void

  @State private var shown: String?

  private static let weekdays = ["M", "T", "W", "T", "F", "S", "S"]

  var body: some View {
    let latest = String(entries.first?.date.prefix(7) ?? "")
    let earliest = String(entries.last?.date.prefix(7) ?? "")
    let todayKey = String(Day.today().prefix(7))
    let last = todayKey > latest ? todayKey : latest
    let month = shown ?? latest
    let (year, m) = Self.parse(month)
    let calendar = Calendar(identifier: .gregorian)
    let first = calendar.date(from: DateComponents(year: year, month: m, day: 1)) ?? Date()
    let days = calendar.range(of: .day, in: .month, for: first)?.count ?? 30
    // weekday: 1 is Sunday; shift so Monday is the first column.
    let lead = (calendar.component(.weekday, from: first) + 5) % 7
    let byDay = Dictionary(grouping: entries, by: \.date)
    let inMonth = entries.filter { $0.date.hasPrefix(month) }.count
    let today = Day.today()

    VStack(alignment: .leading, spacing: Space.m) {
      Text("Calendar").font(.headline)
      HStack {
        navButton("chevron.left", "Previous month", disabled: month <= earliest) { shown = Self.add(month, -1) }
        Spacer()
        Text(Self.title(year, m))
          .font(.callout.weight(.semibold))
        Spacer()
        navButton("chevron.right", "Next month", disabled: month >= last) { shown = Self.add(month, 1) }
      }
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: Space.xs) {
        ForEach(Array(Self.weekdays.enumerated()), id: \.offset) { _, d in
          Text(d).font(.caption.weight(.semibold)).foregroundStyle(.tertiary).accessibilityHidden(true)
        }
        ForEach(0..<lead, id: \.self) { _ in Color.clear.frame(height: 40).accessibilityHidden(true) }
        ForEach(1...days, id: \.self) { day in
          let date = String(format: "%@-%02d", month, day)
          if let seen = byDay[date] {
            Button {
              onSelect(seen[0].id)
            } label: {
              Text("\(day)")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(Palette.tint, in: .circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(day) \(Self.title(year, m)): \(seen.map(\.title).joined(separator: ", "))")
          } else {
            Text("\(day)")
              .font(.subheadline.weight(date == today ? .semibold : .regular))
              .foregroundStyle(date == today ? Palette.tintText : .primary)
              .frame(width: 40, height: 40)
              .accessibilityHidden(true)
          }
        }
      }
      .monospacedDigit()
      Text(inMonth == 0 ? "No shows this month" : "\(inMonth) \(inMonth == 1 ? "show" : "shows") this month")
        .font(.footnote)
        .foregroundStyle(.secondary)
    }
    .padding(Space.l)
    .groupedCard()
  }

  private func navButton(_ symbol: String, _ label: String, disabled: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.body.weight(.semibold))
        .frame(width: Space.touch, height: Space.touch)
    }
    .buttonStyle(.borderless)
    .disabled(disabled)
    .accessibilityLabel(label)
  }

  static func parse(_ key: String) -> (Int, Int) {
    let parts = key.split(separator: "-").compactMap { Int($0) }
    return (parts.first ?? 2026, parts.count > 1 ? parts[1] : 1)
  }

  /// "2026-10" plus or minus months.
  static func add(_ key: String, _ delta: Int) -> String {
    let (y, m) = parse(key)
    let total = y * 12 + (m - 1) + delta
    return String(format: "%04d-%02d", total / 12, total % 12 + 1)
  }

  static func title(_ year: Int, _ month: Int) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_GB")
    f.dateFormat = "MMMM yyyy"
    return f.string(from: Calendar(identifier: .gregorian).date(from: DateComponents(year: year, month: month, day: 15)) ?? Date())
  }
}

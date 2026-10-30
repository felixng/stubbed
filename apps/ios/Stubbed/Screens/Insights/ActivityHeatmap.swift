import SwiftUI

/// Compact visual grid plus a native date picker for accessible 44pt day selection.
/// Tiny heatmap cells are a chart, not undersized individual touch targets.
struct ActivityHeatmap: View {
  let year: Int
  let counts: [String: Int]
  let onSelect: (String) -> Void
  @ScaledMetric(relativeTo: .footnote) private var monthLabelHeight: CGFloat = 20
  @ScaledMetric(relativeTo: .footnote) private var cellSide: CGFloat = 12
  @ScaledMetric(relativeTo: .footnote) private var cellGap: CGFloat = 4
  @State private var selectedDate = Date()
  @State private var choosingDay = false

  private var weeks: [[String?]] { ActivityGrid.weeks(year: year) }

  var body: some View {
    VStack(alignment: .leading, spacing: Space.m) {
      ScrollViewReader { proxy in
        ScrollView(.horizontal) {
          HStack(alignment: .top, spacing: cellGap) {
            ForEach(Array(weeks.enumerated()), id: \.offset) { index, week in
              VStack(spacing: cellGap) {
                // Month labels appear at the first full week of each month.
                Color.clear.frame(width: cellSide, height: monthLabelHeight)
                  .overlay(alignment: .leading) {
                    Text(monthLabel(week)).font(.footnote).foregroundStyle(.secondary).fixedSize()
                  }
                ForEach(0..<7, id: \.self) { day in
                  let count = week[day].flatMap { counts[$0] } ?? 0
                  RoundedRectangle(cornerRadius: 2)
                    .fill(week[day] == nil ? Color.clear : cellColor(count))
                    .overlay {
                      if count > 0 {
                        Circle().fill(Palette.tintText).frame(
                          width: cellSide / 4, height: cellSide / 4)
                      }
                    }
                    .frame(width: cellSide, height: cellSide)
                }
              }
              .frame(width: cellSide)
              .id(index)
            }
          }
          .padding(.vertical, Space.xs)
          .contentShape(.rect)
          .gesture(
            SpatialTapGesture().onEnded { tap in
              guard tap.location.y >= monthLabelHeight + cellGap + Space.xs else { return }
              let column = Int(tap.location.x / (cellSide + cellGap))
              let row = Int(
                (tap.location.y - monthLabelHeight - cellGap - Space.xs) / (cellSide + cellGap))
              guard weeks.indices.contains(column), (0..<7).contains(row),
                let day = weeks[column][row]
              else { return }
              onSelect(day)
            }
          )
          .accessibilityHidden(true)
        }
        .scrollIndicators(.hidden)
        .onAppear {
          let today = Day.today()
          let index = weeks.firstIndex { $0.contains(today) } ?? 0
          proxy.scrollTo(index, anchor: .trailing)
        }
      }
      HStack {
        Text("Mon–Sun · darker means more shows")
          .font(.footnote).foregroundStyle(.secondary)
        Spacer(minLength: 0)
      }
      Button {
        let today = Day.today()
        selectedDate = Day.date(today.hasPrefix(String(year)) ? today : "\(year)-01-01")
        choosingDay = true
      } label: {
        HStack(alignment: .firstTextBaseline, spacing: Space.s) {
          Image(systemName: "calendar")
          Text("Explore a day").fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, minHeight: Space.touch, alignment: .leading)
        .contentShape(.rect)
      }
      .buttonStyle(.borderless)
      .accessibilityLabel("Explore a day")
      .accessibilityHint(
        "Choose a date to see its shows. The activity grid has one column per week.")
    }
    .sheet(isPresented: $choosingDay) {
      NavigationStack {
        Form {
          DatePicker(
            "Performance date", selection: $selectedDate,
            in: Day.date("\(year)-01-01")...Day.date("\(year)-12-31"), displayedComponents: .date
          )
          .datePickerStyle(.graphical)
          LabeledContent("Shows", value: (counts[Day.string(selectedDate)] ?? 0).formatted())
        }
        .navigationTitle("Activity in \(year.formatted(.number.grouping(.never)))")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) { Button("Cancel") { choosingDay = false } }
          ToolbarItem(placement: .confirmationAction) {
            Button("View shows") {
              choosingDay = false
              onSelect(Day.string(selectedDate))
            }
          }
        }
      }
    }
  }

  private func monthLabel(_ week: [String?]) -> String {
    guard let key = week.compactMap({ $0 }).first(where: { $0.hasSuffix("-01") }) else { return "" }
    return Day.date(key).formatted(.dateTime.month(.abbreviated))
  }

  private func cellColor(_ count: Int) -> Color {
    count == 0
      ? Color(.tertiarySystemFill) : Palette.tint.opacity(min(1, 0.25 + Double(count) * 0.2))
  }
}

import SwiftUI

/// Your trips, newest first, on the Profile tab next to the diary. Not a tab
/// of their own: most visits aren't part of a trip.
struct TripsList: View {
  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var trips: Loadable<[Trips.Listed]> = .loading

  var body: some View {
    VStack(alignment: .trailing, spacing: Space.m) {
      Button("New trip", systemImage: "plus") { router.newTrip() }
        .font(.subheadline.weight(.semibold))
        .frame(minHeight: Space.touch)
      switch trips {
      case .loading:
        LoadingText()
      case .failed(let message):
        EmptyState(title: "Couldn’t load your trips", systemImage: "wifi.exclamationmark") { Text(message) }
      case .loaded(let list) where list.isEmpty:
        EmptyState(title: "No trips yet", systemImage: "suitcase") {
          Text("Group shows from a trip or festival, like “NYC Oct 2026”. Pick them in your diary, or start a trip here.")
        }
      case .loaded(let list):
        VStack(spacing: 0) {
          ForEach(Array(list.enumerated()), id: \.element.id) { index, item in
            if index > 0 { Divider().padding(.leading, Space.l + 36 + Space.l) }
            NavigationLink(value: AppRouter.Route.trip(item.trip.id)) {
              HStack(spacing: Space.l) {
                Image(systemName: "suitcase.fill")
                  .font(.body)
                  .foregroundStyle(Palette.tintText)
                  .frame(width: 36, height: 36)
                  .background(Palette.tintFill, in: .rect(cornerRadius: 8, style: .continuous))
                  .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                  Text(item.trip.name).font(.headline).foregroundStyle(.primary).lineLimit(1)
                  Text(item.trip.dates).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                Text("\(item.count) \(item.count == 1 ? "show" : "shows")")
                  .font(.subheadline)
                  .foregroundStyle(.secondary)
                  .monospacedDigit()
                RowChevron()
              }
              .padding(.horizontal, Space.l)
              .padding(.vertical, Space.m)
              .frame(minHeight: Space.touch)
            }
            .pressableRow()
            .accessibilityElement(children: .combine)
          }
        }
        .groupedCard()
      }
    }
    .task(id: router.dataVersion) { await load() }
  }

  private func load() async {
    guard let userId = session.userId else { return }
    do {
      trips = .loaded(try await Trips.list(userId))
    } catch {
      if trips.value == nil { trips = .failed("Check your connection and try again.") }
    }
  }
}

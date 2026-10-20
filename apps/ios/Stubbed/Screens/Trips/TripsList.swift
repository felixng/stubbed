import SwiftUI

/// Your trips, newest first, as rows for the Profile tab's list (next to
/// the diary, not a tab of their own: most visits aren't part of a trip).
struct TripsList: View {
  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var trips: Loadable<[Trips.Listed]> = .loading

  var body: some View {
    Group {
      switch trips {
      case .loading:
        PlaceholderRows(count: 2)
      case .failed(let message):
        EmptyState(title: "Couldn’t load your trips", systemImage: "wifi.exclamationmark") { Text(message) }
          .listRowBackground(Color.clear)
      case .loaded(let list):
        Section {
          ForEach(list) { item in
            NavigationLink(value: AppRouter.Route.trip(item.trip.id)) {
              LabeledContent {
                Text("\(item.count) \(item.count == 1 ? "show" : "shows")").monospacedDigit()
              } label: {
                Label {
                  Text(item.trip.name)
                  Text(item.trip.dates)
                } icon: {
                  Image(systemName: "suitcase.fill").foregroundStyle(Palette.tintText)
                }
              }
            }
          }
          Button("New trip", systemImage: "plus") { router.newTrip() }
        } footer: {
          if list.isEmpty {
            Text("Group shows from a trip or festival, like “NYC Oct 2026”. Select them in your diary, or start a trip here.")
          }
        }
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

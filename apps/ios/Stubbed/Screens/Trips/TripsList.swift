import SwiftUI

/// A dedicated destination for your trips, reached from Profile.
struct TripsList: View {
  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var trips: Loadable<[Trips.Listed]> = .loading

  var body: some View {
    List {
      switch trips {
      case .loading:
        PlaceholderRows(count: 2)
      case .failed(let message):
        EmptyState(title: "Couldn’t load your trips", systemImage: "wifi.exclamationmark") { Text(message) }
          .listRowBackground(Color.clear)
        Button("Try again") { Task { await load() } }
      case .loaded(let list):
        Section {
          if list.isEmpty {
            ContentUnavailableView(
              "No trips yet", systemImage: "suitcase",
              description: Text("Use + to plan a trip, or select shows in your diary to group them."))
          }
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
        } footer: {
          if list.isEmpty {
            Text("Group shows from a trip or festival, like “NYC Oct 2026”. Select them in your diary, or start a trip here.")
          }
        }
      }
    }
    .listStyle(.insetGrouped)
    .tabBarClearance()
    .navigationTitle("Trips")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button("New trip", systemImage: "plus") { router.newTrip() }
      }
    }
    .refreshable { await load() }
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

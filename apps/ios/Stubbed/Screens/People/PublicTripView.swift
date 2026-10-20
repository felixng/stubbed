import SwiftUI

/// A trip as others see it, like the web's /t/:id: the name, dates and
/// place, who went, its numbers, then each public show in date order.
struct PublicTripView: View {
  let id: UUID

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var state: Loadable<PublicPages.TripPage?> = .loading

  var body: some View {
    List {
      switch state {
      case .loading:
        PlaceholderRows(count: 3)
      case .failed(let message):
        EmptyState(title: "Couldn’t load this trip", systemImage: "wifi.exclamationmark") { Text(message) }
          .listRowBackground(Color.clear)
      case .loaded(nil):
        EmptyState(title: "This trip isn’t available", systemImage: "eye.slash") {
          Text("It may be private, or it may have been deleted.")
        }
        .listRowBackground(Color.clear)
      case .loaded(let page?):
        summary(page)
        Section("The shows") {
          ForEach(page.entries) { entry in
            PostCard(
              entry: entry, owner: page.owner, photo: entry.photoPath.flatMap { page.photos[$0] },
              mine: entry.userId == session.userId, inTrip: page.trip.id, reactions: page.reactions[entry.id] ?? Reactions())
              .padding(.bottom, Space.l)
          }
        }
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
      }
    }
    .listStyle(.insetGrouped)
    .tabBarClearance()
    .navigationTitle(state.value??.trip.name ?? "Trip")
    .navigationBarTitleDisplayMode(.inline)
    .refreshable { await load() }
    .task(id: router.dataVersion) { await load() }
  }

  /// Name, dates and place, who went, then the trip's numbers.
  @ViewBuilder private func summary(_ page: PublicPages.TripPage) -> some View {
    Section {
      VStack(alignment: .leading, spacing: 2) {
        Text(page.trip.name).font(.title3.bold()).accessibilityAddTraits(.isHeader)
        Text([page.trip.dates, page.place].compactMap { $0 }.joined(separator: " · "))
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }
      .padding(.vertical, Space.xs)
      NavigationLink(value: AppRouter.Route.profile(handle: page.owner.handle)) {
        HStack(spacing: Space.m) {
          Avatar(name: page.owner.name, url: page.owner.avatarURL, size: 32)
          VStack(alignment: .leading, spacing: 0) {
            Text(verbatim: "@\(page.owner.handle)").font(.subheadline.weight(.semibold))
            if let name = page.owner.displayName {
              Text(name).font(.footnote).foregroundStyle(.secondary)
            }
          }
        }
      }
    }
    Section {
      LabeledContent(page.entries.count == 1 ? "Show" : "Shows", value: page.entries.count.formatted())
      LabeledContent(page.venues == 1 ? "Theatre" : "Theatres", value: page.venues.formatted())
      LabeledContent(page.nights == 1 ? "Night" : "Nights", value: page.nights.formatted())
      if let average = page.average {
        LabeledContent("Average rating", value: average.formatted(.number.precision(.fractionLength(1))))
      }
    }
  }

  private func load() async {
    do {
      state = .loaded(try await PublicPages.trip(id))
    } catch {
      if state.value == nil { state = .failed("Check your connection and try again.") }
    }
  }
}

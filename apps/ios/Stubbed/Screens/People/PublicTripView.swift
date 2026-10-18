import SwiftUI

/// A trip as others see it, like the web's /t/:id: the name, dates and
/// place, who went, its numbers, then each public show in date order.
struct PublicTripView: View {
  let id: UUID

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var state: Loadable<PublicPages.TripPage?> = .loading

  var body: some View {
    Screen(title: state.value??.trip.name ?? "Trip") {
      switch state {
      case .loading:
        LoadingText()
      case .failed(let message):
        EmptyState(title: "Couldn’t load this trip", systemImage: "wifi.exclamationmark") { Text(message) }
      case .loaded(nil):
        EmptyState(title: "This trip isn’t available", systemImage: "eye.slash") {
          Text("It may be private, or it may have been deleted.")
        }
      case .loaded(let page?):
        summary(page)
        Text("The shows")
          .font(.title3.bold())
          .accessibilityAddTraits(.isHeader)
        ForEach(page.entries) { entry in
          PostCard(
            entry: entry, owner: page.owner, photo: entry.photoPath.flatMap { page.photos[$0] },
            mine: entry.userId == session.userId, inTrip: page.trip.id, reactions: page.reactions[entry.id] ?? Reactions())
        }
      }
    }
    .navigationBarTitleDisplayMode(.large)
    .refreshable { await load() }
    .task(id: router.dataVersion) { await load() }
  }

  private func summary(_ page: PublicPages.TripPage) -> some View {
    var numbers: [(String, String)] = [
      ("\(page.entries.count)", page.entries.count == 1 ? "Show" : "Shows"),
      ("\(page.venues)", page.venues == 1 ? "Theatre" : "Theatres"),
      ("\(page.nights)", page.nights == 1 ? "Night" : "Nights"),
    ]
    if let average = page.average { numbers.append((String(format: "%.1f", average), "Avg rating")) }
    return VStack(alignment: .leading, spacing: Space.l) {
      Text([page.trip.dates, page.place].compactMap { $0 }.joined(separator: " · "))
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .padding(.top, -Space.l)
      NavigationLink(value: AppRouter.Route.profile(handle: page.owner.handle)) {
        HStack(spacing: Space.m) {
          Avatar(name: page.owner.name, url: page.owner.avatarURL, size: 40)
          VStack(alignment: .leading, spacing: 0) {
            Text(verbatim: "@\(page.owner.handle)").font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
            if let name = page.owner.displayName {
              Text(name).font(.footnote).foregroundStyle(.secondary)
            }
          }
          Spacer(minLength: 0)
          RowChevron()
        }
        .padding(.horizontal, Space.l)
        .padding(.vertical, Space.m)
      }
      .pressableRow()
      .groupedCard()
      HStack(spacing: 0) {
        ForEach(Array(numbers.enumerated()), id: \.offset) { index, item in
          if index > 0 { Divider().padding(.vertical, Space.m) }
          VStack(spacing: 2) {
            Text(item.0).font(.title2.bold()).monospacedDigit()
            Text(item.1).font(.footnote).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.8)
          }
          .frame(maxWidth: .infinity)
          .padding(.vertical, Space.m)
          .accessibilityElement(children: .combine)
        }
      }
      .fixedSize(horizontal: false, vertical: true)
      .groupedCard()
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

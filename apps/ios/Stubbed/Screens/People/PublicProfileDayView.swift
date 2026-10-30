import SwiftUI

struct PublicProfileDay: Identifiable {
  let profile: Profile
  let date: String
  var id: String { "\(profile.id)-\(date)" }
}

/// The date query keeps heat-map selection complete even for long diaries.
struct PublicProfileDayView: View {
  let selection: PublicProfileDay
  @Environment(AppRouter.self) private var router
  @Environment(\.dismiss) private var dismiss
  @State private var entries: Loadable<[Entry]> = .loading

  var body: some View {
    NavigationStack {
      List {
        switch entries {
        case .loading: PlaceholderRows(count: 2)
        case .failed(let message):
          Text(message).foregroundStyle(.secondary)
          Button("Try again") { Task { await load() } }
        case .loaded(let list):
          if list.isEmpty {
            ContentUnavailableView("No public shows on this date", systemImage: "theatermasks")
          }
          ForEach(list) { entry in
            Button {
              dismiss()
              router.open(.publicEntry(entry.id))
            } label: { EntryRow(entry: entry, photo: nil) }
            .foregroundStyle(.primary)
          }
        }
      }
      .listStyle(.insetGrouped)
      .navigationTitle(Day.format(selection.date))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
      .task { await load() }
    }
  }

  private func load() async {
    do {
      let list = try await PublicPages.entries(profileId: selection.profile.id, day: selection.date)
      try Task.checkCancellation()
      entries = .loaded(list)
    } catch {
      if !Task.isCancelled { entries = .failed("Couldn’t load these public shows.") }
    }
  }
}

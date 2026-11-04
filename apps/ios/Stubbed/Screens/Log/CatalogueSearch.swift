import SwiftUI

/// Pick a show: search the catalogue (`search_shows`), or "Add '<title>'"
/// to create it on save. Presented as a sheet from the log form. After a
/// search that found nothing, picking a show offers to remember that search
/// as its nickname (#35), so "Lez Miz" finds it next time. "Add" tidies the
/// title and asks "Did you mean…?" when close shows exist; the same show is
/// used outright (#146).
struct ShowSearch: View {
  var initialQuery = ""
  let onPick: (ShowChoice) -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var query = ""
  @State private var results: [Show] = []
  @State private var searching = false
  /// The last search that found nothing, and the nickname offer it led to.
  @State private var missed: String?
  @State private var offer: Show?
  @State private var didYouMean: DidYouMean<Show>?

  var body: some View {
    NavigationStack {
      List {
        let q = query.trimmingCharacters(in: .whitespaces)
        ForEach(q.count >= 2 ? results : []) { show in
          row(show.title, show.subtitle) { pickExisting(show, query: q) }
        }
        if !q.isEmpty, !results.contains(where: { $0.title.lowercased() == q.lowercased() }) {
          row("Add “\(q)”", results.isEmpty || q.count < 2 ? "New show" : "Not one of these? Add it as a new show", emphasis: true) { Task { await addNew(q) } }
        }
      }
      .listStyle(.plain)
      .navigationTitle("Show")
      .navigationBarTitleDisplayMode(.inline)
      .searchable(
        text: $query, isPresented: $searching, placement: .navigationBarDrawer(displayMode: .always),
        prompt: "Search shows")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
      }
      .task(id: query) {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { return }
        try? await Task.sleep(for: .milliseconds(150))
        guard !Task.isCancelled, let found = try? await Entries.searchShows(q) else { return }
        results = Array(found.prefix(8))
        if found.isEmpty { missed = q }
      }
      .alert(
        "Remember “\(missed ?? "")”?", isPresented: Binding(get: { offer != nil }, set: { if !$0 { offer = nil } }),
        presenting: offer
      ) { show in
        Button("Remember") {
          if let alias = missed {
            Task { try? await Entries.rememberShowAlias(alias, for: show.id) }
          }
          pick(ShowChoice(show))
        }
        Button("Not now", role: .cancel) { pick(ShowChoice(show)) }
      } message: { show in
        Text("Searching it will find \(show.title) next time.")
      }
      .confirmationDialog(
        "Did you mean…?", isPresented: Binding(get: { didYouMean != nil }, set: { if !$0 { didYouMean = nil } }),
        titleVisibility: .visible, presenting: didYouMean
      ) { suggestion in
        ForEach(suggestion.matches) { show in
          Button("\(show.title) · \(show.type.label)") { pick(ShowChoice(show)) }
        }
        Button("Add “\(suggestion.name)” as new") { pick(ShowChoice(newTitle: suggestion.name)) }
        Button("Cancel", role: .cancel) {}
      }
    }
    .onAppear {
      query = initialQuery
      searching = true
    }
  }

  /// A new show: the same existing one is used, close ones are offered,
  /// otherwise it's added with a tidy title. Offline, it's added as typed.
  private func addNew(_ typed: String) async {
    async let similar = Entries.similarShows(typed)
    async let tidy = Entries.tidyShowTitle(typed)
    let found = (try? await similar) ?? []
    let title = (try? await tidy) ?? typed
    if let same = found.first(where: \.same) {
      pick(ShowChoice(same.item))
    } else if found.isEmpty {
      pick(ShowChoice(newTitle: title))
    } else {
      didYouMean = DidYouMean(name: title, matches: found.map(\.item))
    }
  }

  /// Offers the nickname first when an earlier search missed, unless that
  /// miss was just this search overtyped ("Hamiltonx").
  private func pickExisting(_ show: Show, query q: String) {
    if let missed, !missed.lowercased().hasPrefix(q.lowercased()) {
      offer = show
    } else {
      pick(ShowChoice(show))
    }
  }

  private func pick(_ choice: ShowChoice) {
    onPick(choice)
    dismiss()
  }
}

/// Pick a venue. With an empty search it lists theatres near the photo and
/// recent venues; typing searches the catalogue; "Add '<name>'" creates one
/// on save, with city and country prefilled from `place`, after "Did you
/// mean…?" when close venues exist near the photo or in that city (#146).
struct VenueSearch: View {
  var initialQuery = ""
  var nearby: [VenueChoice] = []
  var suggestions: [Venue] = []
  var place: (city: String?, country: String?) = (nil, nil)
  let onPick: (VenueChoice) -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var query = ""
  @State private var results: [Venue] = []
  @State private var searching = false
  @State private var didYouMean: DidYouMean<Venue>?

  var body: some View {
    NavigationStack {
      List {
        let q = query.trimmingCharacters(in: .whitespaces)
        if q.count < 2 {
          if !nearby.isEmpty {
            Section("Near the photo") {
              ForEach(nearby, id: \.self) { venue in
                row(venue.name, "\(venue.distance ?? 0) m from the photo") { pick(venue) }
              }
            }
          }
          let recent = suggestions.filter { s in !nearby.contains { $0.id == s.id } }
          if !recent.isEmpty {
            Section("Recent") {
              ForEach(recent) { venue in
                row(venue.name, venue.place) { pick(VenueChoice(venue)) }
              }
            }
          }
        } else {
          let nearbyMatches = nearby.filter { $0.id == nil && $0.name.lowercased().contains(q.lowercased()) }
          ForEach(nearbyMatches, id: \.self) { venue in
            row(venue.name, "\(venue.distance ?? 0) m from the photo") { pick(venue) }
          }
          ForEach(results) { venue in
            row(venue.name, venue.place) { pick(VenueChoice(venue)) }
          }
          let names = (results.map(\.name) + nearbyMatches.map(\.name)).map { $0.lowercased() }
          if !names.contains(q.lowercased()) {
            row("Add “\(q)”", "New venue", emphasis: true) { Task { await addNew(q) } }
          }
        }
      }
      .listStyle(.plain)
      .navigationTitle("Venue")
      .navigationBarTitleDisplayMode(.inline)
      .searchable(
        text: $query, isPresented: $searching, placement: .navigationBarDrawer(displayMode: .always),
        prompt: "Search venues")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
      }
      .task(id: query) {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { return }
        try? await Task.sleep(for: .milliseconds(150))
        let near = nearby.first.flatMap { v in v.lat.flatMap { lat in v.lng.map { (lat, $0) } } }
        guard !Task.isCancelled, let found = try? await Entries.searchVenues(q, near: near) else { return }
        results = Array(found.prefix(8))
      }
      .confirmationDialog(
        "Did you mean…?", isPresented: Binding(get: { didYouMean != nil }, set: { if !$0 { didYouMean = nil } }),
        titleVisibility: .visible, presenting: didYouMean
      ) { suggestion in
        ForEach(suggestion.matches) { venue in
          Button([venue.name, venue.place].compactMap { $0 }.joined(separator: " · ")) { pick(VenueChoice(venue)) }
        }
        Button("Add “\(suggestion.name)” as new") {
          pick(VenueChoice(name: suggestion.name, city: place.city, country: place.country))
        }
        Button("Cancel", role: .cancel) {}
      }
    }
    .onAppear {
      query = initialQuery
      searching = true
    }
  }

  /// A venue added by hand: the same existing one is used, close ones are
  /// offered, otherwise it's added. Offline, it's added as typed.
  private func addNew(_ name: String) async {
    let near = nearby.first.flatMap { v in v.lat.flatMap { lat in v.lng.map { (lat, $0) } } }
    let found = (try? await Entries.similarVenues(name, near: near, city: place.city)) ?? []
    if let same = found.first(where: \.same) {
      pick(VenueChoice(same.item))
    } else if found.isEmpty {
      pick(VenueChoice(name: name, city: place.city, country: place.country))
    } else {
      didYouMean = DidYouMean(name: name, matches: found.map(\.item))
    }
  }

  private func pick(_ choice: VenueChoice) {
    onPick(choice)
    dismiss()
  }
}

/// Close existing matches offered before adding `name` as new.
private struct DidYouMean<Item: Identifiable>: Identifiable {
  let name: String
  let matches: [Item]
  var id: String { name }
}

/// A search result: title, then a secondary line. "Add …" rows use the tint.
private func row(_ primary: String, _ secondary: String?, emphasis: Bool = false, action: @escaping () -> Void)
  -> some View
{
  Button(action: action) {
    VStack(alignment: .leading, spacing: 2) {
      Text(primary)
        .font(.headline)
        .foregroundStyle(emphasis ? Palette.tintText : .primary)
      if let secondary {
        Text(secondary)
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }
    }
    .frame(maxWidth: .infinity, minHeight: Space.touch, alignment: .leading)
    .contentShape(.rect)
  }
  .buttonStyle(.plain)
}

import SwiftUI

/// Pick a show: search the catalogue (`search_shows`), or "Add '<title>'"
/// to create it on save. Presented as a sheet from the log form.
struct ShowSearch: View {
  var initialQuery = ""
  let onPick: (ShowChoice) -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var query = ""
  @State private var results: [Show] = []
  @State private var searching = false

  var body: some View {
    NavigationStack {
      List {
        let q = query.trimmingCharacters(in: .whitespaces)
        ForEach(q.count >= 2 ? results : []) { show in
          row(show.title, show.type.label) { pick(ShowChoice(show)) }
        }
        if !q.isEmpty, !results.contains(where: { $0.title.lowercased() == q.lowercased() }) {
          row("Add “\(q)”", "New show", emphasis: true) { pick(ShowChoice(newTitle: q)) }
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
      }
    }
    .onAppear {
      query = initialQuery
      searching = true
    }
  }

  private func pick(_ choice: ShowChoice) {
    onPick(choice)
    dismiss()
  }
}

/// Pick a venue. With an empty search it lists theatres near the photo and
/// recent venues; typing searches the catalogue; "Add '<name>'" creates one
/// on save, with city and country prefilled from `place`.
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
            row("Add “\(q)”", "New venue", emphasis: true) {
              pick(VenueChoice(name: q, city: place.city, country: place.country))
            }
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
    }
    .onAppear {
      query = initialQuery
      searching = true
    }
  }

  private func pick(_ choice: VenueChoice) {
    onPick(choice)
    dismiss()
  }
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

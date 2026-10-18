import SwiftUI

/// A trip, like the web's /app/trips/[id]: name and dates, counts of shows,
/// venues and nights, the recap cards (#71), its shows in date order (take
/// some out, or add others dated within it), Edit and Delete.
struct TripView: View {
  let id: UUID
  var addFailed = false

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @Environment(\.dismiss) private var dismiss

  @State private var state: Loadable<Model> = .loading
  @State private var mode = Mode.idle
  @State private var picked: Set<UUID> = []
  @State private var busy = false
  @State private var error: String?
  @State private var confirmDelete = false

  enum Mode { case idle, add, remove }

  struct Model {
    var trip: Trip
    /// In the trip, oldest first: it reads like an itinerary.
    var entries: [Entry]
    /// Not in the trip but dated within it, so they could join.
    var others: [Entry]
    var photos: [String: URL]
    var handle: String
    var isPrivate: Bool

    /// Shows seen (planned ones are listed but not counted yet).
    var seen: [Entry] { entries.filter { !$0.planned } }
    var venues: Int { Set(seen.compactMap { $0.venue?.id }).count }
    var nights: Int { Set(seen.map(\.date)).count }
  }

  var body: some View {
    Screen(title: state.value?.trip.name ?? "Trip") {
      switch state {
      case .loading:
        LoadingText()
      case .failed(let message):
        EmptyState(title: "Couldn’t load this trip", systemImage: "exclamationmark.triangle") { Text(message) }
      case .loaded(let model):
        content(model)
      }
    }
    .navigationBarTitleDisplayMode(.large)
    .toolbar {
      if let trip = state.value?.trip {
        ToolbarItem(placement: .primaryAction) {
          Button("Edit") { router.editTrip(trip) }
        }
      }
    }
    .safeAreaInset(edge: .bottom) {
      if mode != .idle { selectionBar }
    }
    .task(id: router.dataVersion) { await load() }
  }

  @ViewBuilder private func content(_ m: Model) -> some View {
    Text(m.trip.dates)
      .font(.subheadline)
      .foregroundStyle(.secondary)
      .padding(.top, -Space.l)

    if addFailed {
      Label("Trip created, but the shows you picked weren’t added. Add them below.", systemImage: "exclamationmark.triangle.fill")
        .font(.subheadline)
        .foregroundStyle(.orange)
        .padding(Space.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .groupedCard()
    }

    HStack(spacing: 0) {
      stat(m.seen.count, m.seen.count == 1 ? "show" : "shows")
      Divider().padding(.vertical, Space.m)
      stat(m.venues, m.venues == 1 ? "venue" : "venues")
      Divider().padding(.vertical, Space.m)
      stat(m.nights, m.nights == 1 ? "night" : "nights")
    }
    .fixedSize(horizontal: false, vertical: true)
    .groupedCard()

    if !m.seen.isEmpty {
      TripShare(model: m)
    }

    if mode != .add {
      HStack {
        Text(mode == .remove ? (picked.isEmpty ? "Pick shows to take out" : "\(picked.count) selected") : "Shows")
          .font(mode == .remove ? .subheadline : .title3.bold())
          .foregroundStyle(mode == .remove ? .secondary : .primary)
        Spacer()
        if mode == .idle, !m.others.isEmpty {
          Button("Add shows", systemImage: "plus") {
            picked = Set(m.others.map(\.id))
            mode = .add
          }
          .labelStyle(.iconOnly)
          .font(.body.weight(.semibold))
          .frame(minWidth: Space.touch, minHeight: Space.touch)
        }
        if !m.entries.isEmpty {
          Button(mode == .remove ? "Cancel" : "Select") {
            if mode == .remove { reset() } else { mode = .remove }
          }
          .font(.subheadline.weight(.semibold))
          .frame(minHeight: Space.touch)
        }
      }
      if !m.entries.isEmpty {
        EntryList(entries: m.entries, photos: m.photos, selection: mode == .remove ? $picked : nil)
      } else {
        EmptyState(title: "No shows in this trip yet", systemImage: "suitcase") {
          Text("Add shows dated within the trip, or plan one: it’s offered this trip when its date falls inside.")
        }
      }
    }

    if mode == .add {
      HStack {
        Text("Shows within the trip’s dates")
          .font(.title3.bold())
          .accessibilityAddTraits(.isHeader)
        Spacer()
        Button("Cancel") { reset() }
          .font(.subheadline.weight(.semibold))
          .frame(minHeight: Space.touch)
      }
      EntryList(entries: m.others, photos: m.photos, selection: $picked)
    }

    Button(role: .destructive) {
      confirmDelete = true
    } label: {
      Text("Delete trip")
        .frame(maxWidth: .infinity, minHeight: Space.touch)
    }
    .pressableRow()
    .foregroundStyle(.red)
    .groupedCard()
    .confirmationDialog("Delete \(m.trip.name)?", isPresented: $confirmDelete, titleVisibility: .visible) {
      Button("Delete trip", role: .destructive) { Task { await delete() } }
    } message: {
      Text("Its shows stay in your diary.")
    }
  }

  private var selectionBar: some View {
    VStack(spacing: Space.s) {
      if let error {
        Text(error).font(.footnote).foregroundStyle(.red)
      }
      let n = picked.count
      Button(
        mode == .add
          ? (n > 0 ? "Add \(n) to this trip" : "Pick shows")
          : (n > 0 ? "Take \(n) out of this trip" : "Pick shows")
      ) {
        Task { await apply() }
      }
      .buttonStyle(.borderedProminent)
      .controlSize(.large)
      .frame(maxWidth: .infinity)
      .disabled(n == 0 || busy)
    }
    .padding(.horizontal, Space.l)
    .padding(.vertical, Space.m)
    .background(.bar)
    .overlay(alignment: .top) { Divider() }
  }

  /// One column of the counts card.
  private func stat(_ value: Int, _ label: String) -> some View {
    VStack(spacing: 2) {
      Text("\(value)").font(.title2.bold()).monospacedDigit()
      Text(label).font(.footnote).foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, Space.m)
    .accessibilityElement(children: .combine)
  }

  private func reset() {
    picked = []
    mode = .idle
    error = nil
  }

  private func apply() async {
    guard !picked.isEmpty else { return reset() }
    busy = true
    defer { busy = false }
    do {
      if mode == .add {
        try await Trips.add(Array(picked), to: id)
      } else {
        try await Trips.remove(Array(picked), from: id)
      }
      reset()
      router.dataChanged()
    } catch {
      self.error = "Couldn’t update the trip. Try again."
    }
  }

  private func delete() async {
    do {
      try await Trips.delete(id)
      dismiss()
      router.dataChanged()
    } catch {
      self.error = "Couldn’t delete the trip. Try again."
    }
  }

  private func load() async {
    guard let userId = session.userId else { return }
    do {
      async let trip = Trips.trip(id)
      async let own = Profiles.ownEntries(userId)
      async let profile = Profiles.profile(userId)
      let (t, (all, photos), p) = try await (trip, own, profile)
      state = .loaded(
        Model(
          trip: t,
          entries: all.filter { $0.trips.contains { $0.id == t.id } }.reversed(),
          others: all.filter { e in !e.trips.contains { $0.id == t.id } && t.covers(e.date) },
          photos: photos, handle: p.handle, isPrivate: p.isPrivate))
    } catch {
      if state.value == nil { state = .failed("It may have been deleted.") }
    }
  }
}

/// The trip recap: four card designs drawn on the device from the shows
/// seen, in date order, with their photos.
struct TripShare: View {
  let model: TripView.Model

  @State private var cards: [RenderedCard]?
  @State private var failed = false

  var body: some View {
    ShareCarousel(subject: .trip, cards: cards, failed: failed, text: caption, link: link)
      .task(id: model.seen.map(\.id)) { await draw() }
  }

  private var cities: [String] {
    Array(Set(model.seen.compactMap { $0.venue?.city?.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }))
  }

  private var place: String? {
    cities.count == 1 ? cities[0] : cities.count > 1 ? "\(cities.count) cities" : nil
  }

  private var caption: String {
    let n = model.seen.count
    return "\(model.trip.name): \(n) \(n == 1 ? "show" : "shows")\(place.map { " in \($0)" } ?? ""). Tracked on Stubbed \(stubbedInstagram)"
  }

  /// The public trip page, once one of its shows is public.
  private var link: URL? {
    guard !model.isPrivate, model.seen.contains(where: { $0.visibility == .public }) else { return nil }
    return AppConfig.current.webURL.appendingPathComponent("t/\(model.trip.id.uuidString.lowercased())")
  }

  private func draw() async {
    failed = false
    var shows: [TripCardShow] = []
    for entry in model.seen {
      let photo = await ShareCards.image(entry.photoPath.flatMap { model.photos[$0] })
      shows.append(
        TripCardShow(title: entry.show.title, venue: entry.venue?.name, day: Day.formatShort(entry.date), rating: entry.rating, photo: photo))
    }
    let rated = model.seen.compactMap(\.rating)
    let data = TripCardData(
      name: model.trip.name, dates: model.trip.dates, place: place, cities: cities.count, handle: model.handle,
      shows: shows, venues: model.venues, average: rated.isEmpty ? nil : rated.reduce(0, +) / Double(rated.count))
    do {
      let slug = ShareCards.slug(model.trip.name)
      cards = try TripCardDesign.allCases.map { design in
        let image = try ShareCards.render(TripCardView(design: design, data: data), name: "stubbed-\(slug)-\(design.id)")
        return RenderedCard(id: design.id, name: design.name, file: image.file, image: image.image)
      }
    } catch {
      failed = true
    }
  }
}

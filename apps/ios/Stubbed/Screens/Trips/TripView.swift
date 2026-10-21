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
  @State private var sharing = false

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
    Group {
      switch state {
      case .loading:
        List { PlaceholderRows(count: 3) }
      case .failed(let message):
        EmptyState(title: "Couldn’t load this trip", systemImage: "exclamationmark.triangle") { Text(message) }
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      case .loaded(let model):
        form(model)
      }
    }
    .background(Color(.systemGroupedBackground))
    .navigationTitle(state.value?.trip.name ?? "Trip")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      if let trip = state.value?.trip {
        ToolbarItem(placement: .primaryAction) {
          Button("Edit") { router.editTrip(trip) }
        }
        if !(state.value?.seen.isEmpty ?? true) {
          ToolbarItem(placement: .primaryAction) {
            Button("Share", systemImage: "square.and.arrow.up") { sharing = true }
          }
        }
      }
    }
    .safeAreaInset(edge: .bottom) {
      if mode != .idle { selectionBar }
    }
    .task(id: router.dataVersion) { await load() }
    .sheet(isPresented: $sharing) {
      if let model = state.value { ShareScreen { TripShare(model: model) } }
    }
  }

  /// Dates and counts, the recap cards, the shows, then Delete trip.
  private func form(_ m: Model) -> some View {
    Form {
      Section {
        VStack(alignment: .leading, spacing: Space.m) {
          VStack(alignment: .leading, spacing: 2) {
            Text(m.trip.name).font(.title3.bold()).accessibilityAddTraits(.isHeader)
            Text(m.trip.dates).font(.subheadline).foregroundStyle(.secondary)
          }
          HStack(spacing: 0) {
            stat(m.seen.count, m.seen.count == 1 ? "show" : "shows")
            Divider()
            stat(m.venues, m.venues == 1 ? "venue" : "venues")
            Divider()
            stat(m.nights, m.nights == 1 ? "night" : "nights")
          }
          .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, Space.xs)
      } footer: {
        if addFailed {
          Text("Trip created, but the shows you picked weren’t added. Add them below.").foregroundStyle(.orange)
        }
      }

      if !m.seen.isEmpty {
        Section {
          ShareRow(title: "Share this trip", preview: nil) { sharing = true }
        }
      }

      if mode == .add {
        Section {
          ForEach(m.others) { entry in pickRow(entry, photos: m.photos) }
        } header: {
          HStack {
            Text("Shows within the trip’s dates")
            Spacer()
            Button("Cancel") { reset() }.textCase(nil)
          }
        }
      } else {
        Section {
          if m.entries.isEmpty {
            Text("No shows yet. Add shows dated within the trip, or plan one: it’s offered this trip when its date falls inside.")
              .font(.subheadline)
              .foregroundStyle(.secondary)
          }
          ForEach(m.entries) { entry in
            if mode == .remove {
              pickRow(entry, photos: m.photos)
            } else {
              NavigationLink(value: AppRouter.Route.entry(entry.id)) {
                EntryRow(entry: entry, photo: entry.photoPath.flatMap { m.photos[$0] })
              }
            }
          }
        } header: {
          HStack {
            Text(mode == .remove ? (picked.isEmpty ? "Pick shows to take out" : "\(picked.count) selected") : "Shows")
            Spacer()
            if mode == .idle, !m.others.isEmpty {
              Button("Add shows", systemImage: "plus") {
                picked = Set(m.others.map(\.id))
                mode = .add
              }
              .labelStyle(.iconOnly)
            }
            if !m.entries.isEmpty {
              Button(mode == .remove ? "Cancel" : "Select") {
                if mode == .remove { reset() } else { mode = .remove }
              }
            }
          }
          .textCase(nil)
        }
      }

      Section {
        Button("Delete trip", role: .destructive) { confirmDelete = true }
          .confirmationDialog("Delete \(m.trip.name)?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete trip", role: .destructive) { Task { await delete() } }
          } message: {
            Text("Its shows stay in your diary.")
          }
      } footer: {
        Text("Its shows stay in your diary.")
      }
    }
    .tabBarClearance()
  }

  /// A show you can tick in or out while adding or taking shows out.
  private func pickRow(_ entry: Entry, photos: [String: URL]) -> some View {
    let on = picked.contains(entry.id)
    return Button {
      if on { picked.remove(entry.id) } else { picked.insert(entry.id) }
    } label: {
      HStack(spacing: Space.m) {
        Image(systemName: on ? "checkmark.circle.fill" : "circle")
          .font(.title2)
          .foregroundStyle(on ? AnyShapeStyle(Palette.tint) : AnyShapeStyle(.tertiary))
          .accessibilityHidden(true)
        EntryRow(entry: entry, photo: entry.photoPath.flatMap { photos[$0] })
      }
    }
    .foregroundStyle(.primary)
    .sensoryFeedback(.selection, trigger: on)
    .accessibilityAddTraits(on ? .isSelected : [])
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

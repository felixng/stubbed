import PhotosUI
import SwiftUI

/// Log or edit an entry, like the web's /app/log: show, venue, date, rating
/// (or Upcoming for a future date), note, trip, photo and visibility.
/// Presented as a sheet from the Log button or an entry's Edit.
struct LogView: View {
  let editing: Entry?

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @Environment(\.dismiss) private var dismiss

  @State private var context = Entries.FormContext()
  @State private var loaded = false

  @State private var show: ShowChoice?
  @State private var venue: VenueChoice?
  @State private var date = Day.today()
  @State private var rating: Double?
  @State private var note = ""
  @State private var visibility = Visibility.public
  @State private var tripIds: Set<UUID> = []

  @State private var photo: Data?
  @State private var preview: UIImage?
  @State private var existingPhoto: URL?
  @State private var photoItem: PhotosPickerItem?
  @State private var photoError: String?

  @State private var picking: Picker?
  @State private var saving = false
  @State private var error: String?
  @State private var confirmDiscard = false

  /// Fields the user set themselves, which defaults and the photo never
  /// overwrite.
  @State private var touchedTrips = false
  @State private var touchedVisibility = false
  @State private var touchedShow = false
  @State private var touchedVenue = false
  @State private var touchedDate = false

  // Photo first: new entries start from a photo, which fills in what it
  // can. Every field stays usable while it works.
  @State private var started = false
  @State private var detect = Detect.idle
  @State private var nearby: [VenueChoice] = []
  @State private var place: (city: String?, country: String?) = (nil, nil)
  /// A guess, or a show that differs from the one already picked: a chip.
  @State private var suggestion: Identification?
  /// A venue the photo matched that differs from the one picked by hand.
  @State private var venueSuggestion: VenueChoice?
  /// Fields whose value came from the photo; a new photo clears these.
  @State private var fromPhoto: Set<String> = []
  /// Bumped per photo, so a newer photo cancels the older one's results.
  @State private var run = 0

  enum Detect: Equatable {
    case idle, reading, nearby, identifying
    case done(Identification?, note: String?)
  }

  private enum Picker: String, Identifiable {
    case show, venue
    var id: String { rawValue }
  }

  init(editing: Entry? = nil) {
    self.editing = editing
    if let entry = editing {
      _show = State(initialValue: ShowChoice(entry.show))
      _venue = State(initialValue: entry.venue.map(VenueChoice.init))
      _date = State(initialValue: entry.date)
      _rating = State(initialValue: entry.rating)
      _note = State(initialValue: entry.note ?? "")
      _visibility = State(initialValue: entry.visibility)
      _tripIds = State(initialValue: Set(entry.trips.map(\.id)))
      _touchedTrips = State(initialValue: true)
      _touchedVisibility = State(initialValue: true)
      _touchedShow = State(initialValue: true)
      _touchedVenue = State(initialValue: true)
      _touchedDate = State(initialValue: true)
      _started = State(initialValue: true)
    }
  }

  private var today: String { Day.today() }
  private var planned: Bool { Day.status(date, today: today) == .planned }
  private var offeredTrips: [Trip] { context.trips.filter { $0.covers(date) } }
  private var hasChanges: Bool {
    guard let editing else { return show != nil || venue != nil || rating != nil || !note.isEmpty || photo != nil }
    return show != ShowChoice(editing.show) || venue != editing.venue.map(VenueChoice.init) || date != editing.date
      || rating != editing.rating || note != (editing.note ?? "") || visibility != editing.visibility
      || tripIds != Set(editing.trips.map(\.id)) || photo != nil || (editing.photoPath != nil && existingPhoto == nil && loaded)
  }

  var body: some View {
    NavigationStack {
      Group {
        if started { form } else { start }
      }
      .navigationTitle(editing == nil ? "Track a show" : "Edit")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { if hasChanges { confirmDiscard = true } else { dismiss() } }
        }
      }
      .confirmationDialog("Discard this entry?", isPresented: $confirmDiscard, titleVisibility: .visible) {
        Button("Discard", role: .destructive) { dismiss() }
        Button("Keep editing", role: .cancel) {}
      }
      .sheet(item: $picking) { picker in
        switch picker {
        case .show:
          ShowSearch { pickShow($0) }
        case .venue:
          VenueSearch(nearby: nearby, suggestions: venueSuggestions, place: venuePlace) { pickVenue($0) }
        }
      }
    }
    .interactiveDismissDisabled(hasChanges)
    .task { await load() }
    .onChange(of: date) { _, _ in preselectTrip() }
    .onChange(of: photoItem) { _, item in
      guard let item else { return }
      photoItem = nil
      Task { await takePhoto(item) }
    }
  }

  /// "Start with a photo": the curtain, the stage, the Playbill or a ticket.
  private var start: some View {
    VStack(spacing: Space.l) {
      PhotosPicker(selection: $photoItem, matching: .images) {
        VStack(spacing: Space.m) {
          Image(systemName: "camera.fill")
            .font(.largeTitle)
            .foregroundStyle(Palette.tintText)
            .frame(width: 72, height: 72)
            .background(Palette.tintFill, in: .circle)
          Text("Start with a photo")
            .font(.title3.bold())
            .foregroundStyle(.primary)
          Text("The curtain, the stage, the Playbill or your ticket. We’ll fill in what we can.")
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .frame(maxWidth: 280)
          Text("Choose photo")
            .font(.headline)
            .foregroundStyle(Palette.onTint)
            .padding(.horizontal, Space.xxl)
            .frame(minHeight: 50)
            .background(Palette.tint, in: .capsule)
            .padding(.top, Space.s)
        }
        .padding(.horizontal, Space.xxl)
        .padding(.vertical, Space.xxl)
        .frame(maxWidth: .infinity)
      }
      .buttonStyle(.plain)
      .groupedCard()
      .accessibilityLabel("Start with a photo")
      .accessibilityHint("The curtain, the stage, the Playbill or your ticket.")

      Button("No photo? Fill in by hand") { started = true }
        .font(.subheadline.weight(.semibold))
        .frame(minHeight: Space.touch)
      Spacer()
    }
    .padding(Space.l)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color(.systemGroupedBackground))
  }

  private var form: some View {
    Form {
      photoSection
      showSection
      venueSection
      dateSection
      ratingSection
      noteSection
      if !offeredTrips.isEmpty { tripsSection }
      visibilitySection
      if let error {
        Section {
          Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red)
        }
      }
    }
    .scrollDismissesKeyboard(.interactively)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        if saving {
          ProgressView()
        } else {
          Button(editing == nil && planned ? "Add" : "Save") { Task { await save() } }
            .fontWeight(.semibold)
            .accessibilityHint(planned ? "Adds it to Upcoming" : "")
        }
      }
    }
  }

  // MARK: - Fields

  private var photoSection: some View {
    Section {
      HStack(alignment: .center, spacing: Space.l) {
        Group {
          if let preview {
            Image(uiImage: preview).resizable().scaledToFill()
          } else if let existingPhoto {
            RemoteImage(url: existingPhoto)
          } else {
            Image(systemName: "photo")
              .font(.title2)
              .foregroundStyle(.secondary)
              .frame(maxWidth: .infinity, maxHeight: .infinity)
              .background(Color(.tertiarySystemFill))
          }
        }
        .frame(width: 72, height: 72)
        .clipShape(.rect(cornerRadius: Radius.sm, style: .continuous))
        .accessibilityHidden(true)

        VStack(alignment: .leading, spacing: Space.xs) {
          HStack(spacing: Space.l) {
            PhotosPicker(hasPhoto ? "Change photo" : "Add photo", selection: $photoItem, matching: .images)
            if hasPhoto {
              Button("Remove", role: .destructive) {
                clearPhotoResults()
                photo = nil
                preview = nil
                existingPhoto = nil
              }
              .foregroundStyle(.red)
            }
          }
          .buttonStyle(.borderless)
          .font(.subheadline.weight(.semibold))
          .frame(minHeight: Space.touch)
          if let photoError {
            Text(photoError)
              .font(.footnote)
              .foregroundStyle(.red)
          } else if let status = detectStatus {
            HStack(spacing: Space.s) {
              if status.working { ProgressView().controlSize(.mini) }
              Text(status.text)
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
          }
        }
      }
    }
  }

  private var hasPhoto: Bool { preview != nil || existingPhoto != nil }

  private var showSection: some View {
    Section("Show") {
      if let show {
        SelectedValue(primary: show.title, secondary: show.id == nil ? "New show" : show.type.label) {
          picking = .show
        }
        if show.id == nil {
          SwiftUI.Picker("Type", selection: Binding(get: { show.type }, set: { self.show?.type = $0 })) {
            ForEach(ShowType.ordered, id: \.self) { Text($0.label).tag($0) }
          }
          .pickerStyle(.menu)
        }
      } else {
        SearchButton(title: "Search shows") { picking = .show }
        if detect == .identifying {
          Label("Working out the show from your photo…", systemImage: "sparkle.magnifyingglass")
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      }
      if let suggestion, let title = suggestion.showTitle, show == nil || showDiffers {
        Button { Task { await take(suggestion) } } label: {
          Label {
            Text(showDiffers ? "Photo suggests \(title)" : "Maybe \(title)?")
            Text(suggestion.reason).lineLimit(2)
          } icon: {
            Image(systemName: "sparkles")
          }
        }
      }
    }
  }

  private var showDiffers: Bool {
    guard let title = suggestion?.showTitle, let show else { return false }
    return show.title.lowercased() != title.lowercased()
  }

  private var venueSection: some View {
    Section {
      if let venue {
        SelectedValue(primary: venue.name, secondary: venue.isNew ? "New venue" : venue.place) {
          picking = .venue
        }
        // A venue added by hand needs a city and country for stats.
        if venue.isNew {
          TextField("City", text: binding(\.city))
            .textContentType(.addressCity)
            .accessibilityLabel("City")
          TextField("Country", text: binding(\.country))
            .textContentType(.countryName)
            .accessibilityLabel("Country")
        }
      } else {
        SearchButton(title: "Search venues") { picking = .venue }
        // Several theatres close by: one tap instead of a search.
        if nearby.count > 1 {
          ForEach(nearby.prefix(3), id: \.self) { v in
            Button { pickVenue(v) } label: {
              Label("\(v.name) · \(v.distance ?? 0) m", systemImage: "mappin.and.ellipse")
            }
          }
        }
      }
      if let venueSuggestion, venue != nil {
        Button { pickVenue(venueSuggestion) } label: {
          Label("Photo suggests \(venueSuggestion.name)", systemImage: "sparkles")
        }
      }
    } header: {
      Text(planned ? "Venue (optional)" : "Venue")
    }
  }

  private func binding(_ key: WritableKeyPath<VenueChoice, String?>) -> Binding<String> {
    Binding(get: { venue?[keyPath: key] ?? "" }, set: { venue?[keyPath: key] = $0 })
  }

  private var dateSection: some View {
    Section {
      DatePicker("Date", selection: Binding(get: { Day.date(date) }, set: { setDate(Day.string($0)) }), displayedComponents: .date)
      // One-tap shortcuts for logging straight after a show.
      HStack(spacing: Space.s) {
        quickDate("Today", today)
        quickDate("Yesterday", Day.today(offset: -1))
      }
      .controlSize(.small)
    }
  }

  @ViewBuilder private func quickDate(_ title: String, _ day: String) -> some View {
    if date == day {
      Button(title) { setDate(day) }.buttonStyle(.borderedProminent).accessibilityAddTraits(.isSelected)
    } else {
      Button(title) { setDate(day) }.buttonStyle(.bordered)
    }
  }

  private var ratingSection: some View {
    Section("Rating") {
      if planned {
        Label("That’s after today, so this goes in Upcoming. Rate it after you’ve been.", systemImage: "calendar")
          .font(.subheadline)
      } else {
        RatingInput(value: $rating)
      }
    }
  }

  private var noteSection: some View {
    Section("Note (optional)") {
      TextField("Note", text: $note, prompt: Text("What stayed with you?"), axis: .vertical)
        .lineLimit(3...10)
        .accessibilityLabel("Note")
    }
  }

  private var tripsSection: some View {
    Section("Part of a trip?") {
      ForEach(offeredTrips) { trip in
        let on = tripIds.contains(trip.id)
        Button {
          touchedTrips = true
          if on { tripIds.remove(trip.id) } else { tripIds.insert(trip.id) }
        } label: {
          HStack {
            Label(trip.name, systemImage: "suitcase").foregroundStyle(.primary)
            Spacer()
            if on { Image(systemName: "checkmark").fontWeight(.semibold) }
          }
        }
        .accessibilityAddTraits(on ? .isSelected : [])
      }
    }
  }

  private var visibilitySection: some View {
    Section {
      SwiftUI.Picker("Who can see this", selection: Binding(get: { visibility }, set: { touchedVisibility = true; visibility = $0 })) {
        Text("Public").tag(Visibility.public)
        Text("Private").tag(Visibility.private)
      }
      .pickerStyle(.segmented)
      .listRowBackground(Color.clear)
      .listRowInsets(EdgeInsets())
    } header: {
      Text("Who can see this")
    } footer: {
      Text(visibility == .public ? "Anyone with the link can see this entry." : "Only you can see this entry.")
    }
  }

  // MARK: - Suggestions

  /// The venue last used with this show, then recent venues (up to five).
  private var venueSuggestions: [Venue] {
    var out: [Venue] = []
    func add(_ v: Venue) { if !out.contains(where: { $0.id == v.id }) { out.append(v) } }
    if let showId = show?.id, let last = context.recent.first(where: { $0.showId == showId }) { add(last.venue) }
    for item in context.recent where out.count < 5 { add(item.venue) }
    return out
  }

  private var venuePlace: (city: String?, country: String?) {
    if place.city != nil || place.country != nil { return place }
    return (context.recent.first?.venue.city, context.recent.first?.venue.country)
  }

  // MARK: - Your choices

  private func pickShow(_ choice: ShowChoice) {
    touchedShow = true
    fromPhoto.remove("show")
    suggestion = nil
    show = choice
  }

  private func pickVenue(_ choice: VenueChoice) {
    touchedVenue = true
    fromPhoto.remove("venue")
    venueSuggestion = nil
    venue = choice
  }

  private func setDate(_ day: String) {
    touchedDate = true
    fromPhoto.remove("date")
    date = day
  }

  // MARK: - Photo detection

  private var detectStatus: (text: String, working: Bool)? {
    switch detect {
    case .idle: return nil
    case .reading: return ("Reading the photo…", true)
    case .nearby: return ("Looking for theatres nearby…", true)
    case .identifying: return ("Working out the show…", true)
    case .done(let result, let note):
      if let result, result.confidence != .low, !showDiffers {
        return ("\(result.confidence == .high ? "Matched" : "Probably"): \(result.reason)", false)
      }
      if let note { return (note, false) }
      return result == nil ? ("Couldn’t tell the show from this photo.", false) : nil
    }
  }

  /// Forget everything the previous photo filled in or found.
  private func clearPhotoResults() {
    run += 1
    if fromPhoto.contains("show") { show = nil }
    if fromPhoto.contains("venue") { venue = nil }
    if fromPhoto.contains("date") { date = Day.today() }
    fromPhoto = []
    suggestion = nil
    venueSuggestion = nil
    nearby = []
    place = (nil, nil)
    photoError = nil
    detect = .idle
  }

  /// The photo's date at once, theatres near it within about a second, and
  /// the show suggestion when it's ready. Each fills only untouched fields.
  private func detect(from data: Data) async {
    let token = run
    let current = { token == run }
    detect = .reading
    let meta = PhotoMeta.read(data)
    if let day = meta.date, !touchedDate {
      date = day
      fromPhoto.insert("date")
    }

    if let lat = meta.lat, let lng = meta.lng {
      detect = .nearby
      let found = await PhotoDetect.nearby(lat: lat, lng: lng, accuracy: meta.accuracy)
      guard current() else { return }
      nearby = found.candidates
      place = (found.city, found.country)
      // One theatre in range is as good as an answer.
      if found.candidates.count == 1, !touchedVenue, venue == nil {
        venue = found.candidates[0]
        fromPhoto.insert("venue")
      }
    }

    detect = .identifying
    guard let small = try? Photo.jpeg(from: data, maxEdge: Photo.identifyEdge, quality: 0.8) else {
      detect = .done(nil, note: nil)
      return
    }
    let outcome = await PhotoDetect.identify(photo: small, meta: meta, place: place, candidates: nearby)
    guard current() else { return }
    switch outcome {
    case .notConfigured:
      detect = .done(nil, note: "Show detection isn’t set up yet.")
    case .failed:
      detect = .done(nil, note: "Couldn’t work out the show.")
    case .found(let result):
      detect = .done(result, note: nil)
      guard let result else { return }
      let differs = show.map { s in result.showTitle.map { s.title.lowercased() != $0.lowercased() } ?? false } ?? false
      if result.confidence == .low || (touchedShow && differs) {
        if result.showTitle != nil { suggestion = result }
        if result.confidence == .low { return }
      }
      await apply(result)
    }
  }

  /// Fill show and venue from the photo, where the user hasn't.
  private func apply(_ result: Identification) async {
    let token = run
    if let title = result.showTitle, !touchedShow, show == nil {
      let same = (try? await Entries.searchShows(title))?.first { $0.title.lowercased() == title.lowercased() }
      guard token == run else { return }
      show = same.map(ShowChoice.init) ?? ShowChoice(newTitle: title, type: result.showType ?? .musical)
      fromPhoto.insert("show")
    }
    let picked = nearby.first { $0.osmId != nil && $0.osmId == result.venueOsmId }
    // A venue picked by hand is never swapped: a different match is offered.
    if touchedVenue {
      if let picked, let current = venue, (current.osmId ?? current.name) != (picked.osmId ?? picked.name) {
        venueSuggestion = picked
      }
      return
    }
    if let picked {
      venue = picked
      fromPhoto.insert("venue")
    } else if let name = result.venueName, venue == nil {
      let same = (try? await Entries.searchVenues(name))?.first { $0.name.lowercased() == name.lowercased() }
      guard token == run else { return }
      venue = same.map(VenueChoice.init) ?? VenueChoice(name: name, city: place.city, country: place.country)
      fromPhoto.insert("venue")
    }
  }

  /// Tapping a "Maybe…" chip is the user's choice, replacing any show.
  private func take(_ s: Identification) async {
    suggestion = nil
    guard let title = s.showTitle else { return }
    let same = (try? await Entries.searchShows(title))?.first { $0.title.lowercased() == title.lowercased() }
    pickShow(same.map(ShowChoice.init) ?? ShowChoice(newTitle: title, type: s.showType ?? .musical))
    if !touchedVenue, let picked = nearby.first(where: { $0.osmId != nil && $0.osmId == s.venueOsmId }) {
      venue = picked
      fromPhoto.insert("venue")
    }
  }

  // MARK: - Load and save

  private func load() async {
    guard !loaded, let userId = session.userId else { return }
    do {
      context = try await Entries.formContext(userId: userId)
      if !touchedVisibility { visibility = context.visibility }
      if let path = editing?.photoPath { existingPhoto = await Entries.signPhotos([path])[path] }
      preselectTrip()
    } catch {
      Log.data.error("Loading the log form failed: \(error.localizedDescription, privacy: .public)")
    }
    loaded = true
  }

  /// Until the user picks, the first trip covering the date is selected.
  private func preselectTrip() {
    guard !touchedTrips else {
      tripIds = tripIds.filter { id in offeredTrips.contains { $0.id == id } }
      return
    }
    tripIds = offeredTrips.first.map { [$0.id] } ?? []
  }

  private func takePhoto(_ item: PhotosPickerItem) async {
    clearPhotoResults()
    started = true
    do {
      guard let data = try await item.loadTransferable(type: Data.self) else { throw Photo.Failure.unreadable }
      let jpeg = try Photo.jpeg(from: data, maxEdge: Photo.storedEdge)
      photo = jpeg
      preview = UIImage(data: jpeg)
      existingPhoto = nil
      // Detection reads the original (its EXIF); only the clean copy is stored.
      await detect(from: data)
    } catch {
      photoError = "Couldn’t read that photo. Try another, or fill in the details below."
      detect = .idle
    }
  }

  /// How far detection got, for entry_logged (same values as the web).
  private var detectionLabel: String {
    switch detect {
    case .idle: "skipped"
    case .done(let result, _): result?.confidence.rawValue ?? "none"
    default: "pending"
    }
  }

  private func save() async {
    error = nil
    guard let show else {
      return error = detect == .identifying ? "Pick a show, or wait for the suggestion from your photo." : "Pick a show."
    }
    if venue == nil, !planned { return error = "Pick a venue." }
    if let venue, venue.isNew,
      (venue.city ?? "").trimmingCharacters(in: .whitespaces).isEmpty
        || (venue.country ?? "").trimmingCharacters(in: .whitespaces).isEmpty
    {
      return error = "Add the venue’s city and country."
    }
    guard let userId = session.userId else { return error = "You’re signed out. Sign in again to save." }

    // Saving wins over a suggestion still on its way: ignore it from here.
    run += 1
    saving = true
    defer { saving = false }
    let draft = Entries.Draft(
      id: editing?.id ?? UUID(), show: show, venue: venue, date: date, rating: rating, note: note,
      visibility: visibility, tripIds: tripIds.filter { id in offeredTrips.contains { $0.id == id } }, photo: photo,
      keepPhoto: existingPhoto != nil)
    do {
      let saved = try await Entries.save(draft, userId: userId, editing: editing)
      if editing == nil, !planned {
        Analytics.track(
          .entryLogged,
          [
            "method": .string(photo != nil ? "photo" : "manual"), "detection": .string(detectionLabel),
            "rated": .bool(rating != nil), "has_note": .bool(!note.trimmingCharacters(in: .whitespaces).isEmpty),
            "platform": .string("ios"),
          ])
      }
      router.saved(saved.id, isNew: editing == nil, planned: planned, photoFailed: saved.photoFailed)
    } catch {
      self.error = error.localizedDescription
    }
  }
}

/// A picked show or venue: tap the row to pick again.
struct SelectedValue: View {
  let primary: String
  let secondary: String?
  let onChange: () -> Void

  var body: some View {
    Button(action: onChange) {
      HStack(spacing: Space.m) {
        VStack(alignment: .leading, spacing: 2) {
          Text(primary)
            .font(.headline)
            .foregroundStyle(.primary)
          if let secondary {
            Text(secondary)
              .font(.subheadline)
              .foregroundStyle(.secondary)
          }
        }
        Spacer()
        Text("Change").font(.subheadline)
      }
    }
    .accessibilityLabel("Change \(primary)")
  }
}

/// A form row that opens a search sheet.
struct SearchButton: View {
  let title: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Label(title, systemImage: "magnifyingglass")
    }
    .accessibilityLabel(title)
  }
}

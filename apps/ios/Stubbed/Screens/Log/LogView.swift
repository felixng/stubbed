import PhotosUI
import Supabase
import SwiftUI

/// Log or edit an entry, like the web's /app/log: show, venue, date, rating
/// (or Upcoming for a future date), note, trip, photo and visibility.
/// Presented as a sheet from the Log button or an entry's Edit, and once
/// per show by a photo import (`importing`).
struct LogView: View {
  let editing: Entry?
  let importing: ImportStep?

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @Environment(Membership.self) private var membership
  @Environment(PaywallRouter.self) private var paywall
  @Environment(\.dismiss) private var dismiss
  @Environment(\.dynamicTypeSize) private var typeSize

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
  @State private var videoItem: PhotosPickerItem?
  @State private var pendingVideo: PhotosPickerItem?
  @State private var resumeVideoPicker = false
  @State private var videoCandidate: VideoCandidate?
  @State private var preparedVideos: [EntryMedia.VideoDraft] = []
  @State private var loadingVideo = false

  private struct VideoCandidate: Identifiable {
    let id = UUID()
    let source: URL
  }
  @State private var galleryPicker = false
  @State private var resumeGalleryPicker = false
  @State private var gallerySelection: [PhotosPickerItem] = []
  @State private var pendingGallery: [PhotosPickerItem] = []
  @State private var additionalPhotos: [EntryMedia.PhotoDraft] = []
  @State private var savedGalleryCount = 0
  @State private var removedCover = false
  private var mediaCount: Int {
    let retainedCount = max(0, savedGalleryCount - (removedCover ? 1 : 0))
    return max(retainedCount, hasPhoto ? 1 : 0) + additionalPhotos.count + preparedVideos.count
  }

  @State private var photoError: String?
  @State private var savedCover: EntryMedia.Cover?
  @State private var cropCandidate: CropCandidate?
  @State private var croppedPhoto: EntryMedia.PhotoDraft?

  private struct CropCandidate: Identifiable {
    let id = UUID()
    let source: Data
    let image: CGImage
    let original: Data?
    let lookup: PhotoLookup?
    var initialCrop: EntryPhotoCrop? = nil
    var recrop = false
    var additional = false
  }

  @State private var picking: Picker?
  @State private var saving = false
  @State private var draftEntryID = UUID()
  @State private var error: String?
  @State private var confirmDiscard = false
  @State private var confirmStop = false
  @State private var importItems: [PhotosPickerItem] = []

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
  /// Shows the photo's printed text matched, when more than one did.
  @State private var photoShows: [Show] = []
  /// Fields whose value came from the photo; a new photo clears these.
  @State private var fromPhoto: Set<String> = []
  /// Bumped per photo, so a newer photo cancels the older one's results.
  @State private var run = 0
  /// Optional "on here around then" chips (#360): only for a known venue and
  /// date, never blocking a field or Save. A response applies only while it
  /// still matches the current venue and date.
  @State private var suggestions: [ShowSuggestion] = []
  /// Where the chosen show came from, for `entry_logged.show_source`.
  @State private var showSource = "manual"
  /// A crawled title with no show yet, seeding the show search (#278).
  @State private var runTitleSeed: String?
  /// A picked photo is on its way (an iCloud original can take seconds to
  /// download) and its thumbnail isn't ready yet.
  @State private var loadingPhoto = false

  enum Detect: Equatable {
    case idle, reading, nearby, text
  }

  private enum Picker: String, Identifiable {
    case show, venue
    var id: String { rawValue }
  }

  init(editing: Entry? = nil, importing: ImportStep? = nil) {
    self.editing = editing
    self.importing = importing
    _started = State(initialValue: importing != nil)
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
    if removedCover || !additionalPhotos.isEmpty || !preparedVideos.isEmpty { return true }
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
      .navigationTitle(title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        if let importing {
          ToolbarItem(placement: .cancellationAction) {
            Button("Stop") { confirmStop = true }
          }
          ToolbarItem(placement: .bottomBar) {
            Button("Skip this show") { importing.onSkip() }
              .disabled(saving)
          }
        } else {
          ToolbarItem(placement: .cancellationAction) {
            Button("Cancel") { if hasChanges { confirmDiscard = true } else { dismiss() } }
          }
        }
      }
      .confirmationDialog("Discard this entry?", isPresented: $confirmDiscard, titleVisibility: .visible) {
        Button("Discard", role: .destructive) { dismiss() }
        Button("Keep editing", role: .cancel) {}
      }
      .confirmationDialog("Stop importing?", isPresented: $confirmStop, titleVisibility: .visible) {
        Button("Stop", role: .destructive) { importing?.onStop() }
        Button("Keep going", role: .cancel) {}
      } message: {
        Text("This show isn’t saved. Shows you’ve saved stay in your diary.")
      }
      .sheet(item: $picking) { picker in
        switch picker {
        case .show:
          ShowSearch(initialQuery: runTitleSeed ?? "") {
            pickShow($0)
            if runTitleSeed != nil { showSource = "run" }
            runTitleSeed = nil
          }
        case .venue:
          VenueSearch(nearby: nearby, suggestions: venueSuggestions, place: venuePlace) { pickVenue($0) }
        }
      }
    }
    .paywallHost(onDismiss: {
      if resumeVideoPicker {
        resumeVideoPicker = false
        if let item = pendingVideo { Task { await prepareVideo(item) } }
      }
      guard resumeGalleryPicker else { return }
      resumeGalleryPicker = false
      galleryPicker = true
    })
    .photosPicker(isPresented: $galleryPicker, selection: $gallerySelection,
      maxSelectionCount: max(1, 10 - mediaCount), matching: .images)
    .onChange(of: gallerySelection) { _, items in
      guard !items.isEmpty else { return }
      pendingGallery = items
      gallerySelection = []
      Task { await nextGalleryCrop() }
    }
    .sheet(item: $cropCandidate, onDismiss: {
      if !pendingGallery.isEmpty { Task { await nextGalleryCrop() } }
    }) { candidate in
      EntryPhotoCropView(image: candidate.image, initialCrop: candidate.initialCrop) { acceptCrop($0, candidate: candidate) }
    }
    .onChange(of: videoItem) { _, item in
      guard let item else { return }
      videoItem = nil
      if membership.canUse("media.video") && (mediaCount == 0 || membership.canUse("media.multiple")) {
        Task { await prepareVideo(item) }
      } else {
        pendingVideo = item
        paywall.present(source: .video) { resumeVideoPicker = true }
      }
    }
    .sheet(item: $videoCandidate) { candidate in
      EntryVideoTrimView(source: candidate.source) { preparedVideos.append(.init(file: $0)) }
        .onDisappear { try? FileManager.default.removeItem(at: candidate.source) }
    }
    .onDisappear {
      for clip in preparedVideos { try? FileManager.default.removeItem(at: clip.file) }
      preparedVideos.removeAll()
    }
    .interactiveDismissDisabled(hasChanges || importing != nil)
    .task { await load() }
    .task { if let importing { await takeImported(importing) } }
    .onChange(of: date) { _, _ in preselectTrip() }
    .task(id: suggestKey) { await loadSuggestions() }
    .onChange(of: photoItem) { _, item in
      guard let item else { return }
      photoItem = nil
      Task { await takePhoto(item) }
    }
    .onChange(of: importItems) { _, items in
      guard !items.isEmpty else { return }
      router.startImport(items)
    }
  }

  private var title: String {
    if let importing { return "Show \(importing.number) of \(importing.total)" }
    return editing == nil ? "Log a show" : "Edit"
  }

  /// Start with a photo, or use the secondary import/manual actions.
  private var start: some View {
    ScrollView {
      VStack(spacing: Space.l) {
        VStack(spacing: Space.m) {
          Image(systemName: "camera.fill")
            .font(.largeTitle)
            .foregroundStyle(.secondary)
          Text("Start with a photo").font(.title3.bold())
          Text("The curtain, the stage, the Playbill or your ticket. We’ll fill in what we can.")
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
          PhotosPicker(selection: $photoItem, matching: .images) {
            Label("Choose photo", systemImage: "photo")
          }
          .buttonStyle(.borderedProminent)
          .controlSize(.large)
          .accessibilityLabel("Start with a photo")
        }
        .padding(Space.l)
        .frame(maxWidth: .infinity)
        .groupedCard()

        PhotosPicker(
          selection: $importItems, maxSelectionCount: PhotoImport.maxPhotos, selectionBehavior: .ordered,
          matching: .images
        ) {
          Label("Import from photos", systemImage: "photo.stack")
        }
        .buttonStyle(.bordered)
        .controlSize(.large)
        .accessibilityHint("Pick photos from several shows and log each show in turn.")

        Button("No photo? Fill in by hand") { started = true }
          .frame(minHeight: Space.touch)
      }
      .padding(Space.l)
    }
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
          if loadingPhoto {
            ProgressView()
              .frame(maxWidth: .infinity, maxHeight: .infinity)
              .background(Color(.tertiarySystemFill))
          } else if let preview {
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
            if membership.config.mediaGalleriesEnabled && hasPhoto {
              Button(mediaCount >= 10 ? "10/10" : "Add more", systemImage: "plus") { addGalleryPhotos() }
                .disabled(mediaCount >= 10 || membership.info == nil)
            }
            if croppedPhoto != nil || savedCover?.legacy == false && existingPhoto != nil {
              Button("Edit crop") { Task { await reopenCrop() } }
            }
            if hasPhoto {
              Button("Remove", role: .destructive) {
                clearPhotoResults()
                removedCover = savedCover != nil || editing?.photoPath != nil
                photo = nil
                croppedPhoto = nil
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
      if membership.config.mediaVideoEnabled && (mediaCount == 0 || membership.config.mediaGalleriesEnabled) {
        PhotosPicker(selection: $videoItem, matching: .videos, preferredItemEncoding: .current) {
          Label("Add video", systemImage: "video")
        }
        .disabled(mediaCount >= 10 || membership.info == nil || loadingVideo || saving)
      }
      if loadingVideo { ProgressView("Loading video…") }
      ForEach(preparedVideos, id: \.requestID) { clip in
        HStack {
          Label("Video ready", systemImage: "video")
          Spacer()
          Button("Remove video", role: .destructive) {
            preparedVideos.removeAll { $0.requestID == clip.requestID }
            try? FileManager.default.removeItem(at: clip.file)
          }
          .disabled(saving)
        }
      }
      ForEach(Array(additionalPhotos.enumerated()), id: \.element.requestID) { index, item in
        HStack {
          if let image = UIImage(data: item.thumbnail) {
            Image(uiImage: image).resizable().scaledToFill()
              .frame(width: 48, height: 48).clipped().accessibilityHidden(true)
          }
          Text("Photo \(index + 2)")
          Spacer()
          Menu("Photo actions", systemImage: "ellipsis.circle") {
            if index > 0 {
              Button("Move earlier") { additionalPhotos.swapAt(index - 1, index) }
            }
            if index + 1 < additionalPhotos.count {
              Button("Move later") { additionalPhotos.swapAt(index, index + 1) }
            }
            Button("Remove photo", role: .destructive) { additionalPhotos.remove(at: index) }
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
        ForEach(photoShows) { s in
          Button {
            pickShow(ShowChoice(s))
            showSource = "photo_text"
          } label: {
            Label("Maybe \(s.title)?", systemImage: "text.viewfinder")
          }
        }
        if !suggestions.isEmpty {
          VStack(alignment: .leading, spacing: Space.s) {
            Text("On here around then")
              .font(.footnote)
              .foregroundStyle(.secondary)
            ForEach(suggestions) { item in
              Button { Task { await pick(item) } } label: {
                Label(item.title, systemImage: "ticket")
              }
              .accessibilityHint("Fills in the show")
            }
          }
        }
      }
    }
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
      let layout = typeSize.isAccessibilitySize
        ? AnyLayout(VStackLayout(alignment: .leading, spacing: Space.s))
        : AnyLayout(HStackLayout(spacing: Space.s))
      layout {
        quickDate("Today", today)
        quickDate("Yesterday", Day.today(offset: -1))
      }
      .controlSize(.small)
    }
  }

  @ViewBuilder private func quickDate(_ title: String, _ day: String) -> some View {
    if date == day {
      Button { setDate(day) } label: { Text(title).fixedSize() }.buttonStyle(.borderedProminent).accessibilityAddTraits(.isSelected)
    } else {
      Button { setDate(day) } label: { Text(title).fixedSize() }.buttonStyle(.bordered)
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

  private var suggestKey: String? {
    guard editing == nil, !saving, show == nil, let id = venue?.id else { return nil }
    return "\(id.uuidString)|\(date)"
  }

  /// Debounced and cancelled by SwiftUI whenever the venue, date, show or
  /// saving state changes or the view goes away; a late response is dropped.
  private func loadSuggestions() async {
    guard let key = suggestKey, let id = venue?.id else {
      suggestions = []
      return
    }
    suggestions = []
    try? await Task.sleep(for: ShowSuggestions.debounce)
    if Task.isCancelled { return }
    let found = await ShowSuggestions.fetch(venueId: id, date: date)
    if Task.isCancelled || key != suggestKey { return }
    suggestions = found
  }

  /// One tap fills the show, only if the field is still empty and untouched.
  private func pick(_ item: ShowSuggestion) async {
    guard show == nil, !touchedShow else { return }
    let source = item.source == "yours" ? "yours" : item.source == "run" ? "run" : "community"
    guard let id = item.showId else {
      // A crawled title with no show yet: the existing show search opens with
      // it, so the usual "Did you mean" resolver decides; nothing is created
      // until Save.
      runTitleSeed = item.title
      picking = .show
      return
    }
    let key = suggestKey
    guard let found = await ShowSuggestions.show(id: id) else { return }
    guard show == nil, !touchedShow, key == suggestKey else { return }
    pickShow(ShowChoice(found))
    showSource = source
    suggestions = []
  }

  private func pickShow(_ choice: ShowChoice) {
    showSource = "manual"
    touchedShow = true
    fromPhoto.remove("show")
    photoShows = []
    show = choice
  }

  private func pickVenue(_ choice: VenueChoice) {
    // One of the photo's own candidates is still the photo's answer: a new
    // photo replaces it and removing the photo clears it. A theatre found by
    // searching is the user's own choice and stays.
    if nearby.contains(choice) {
      touchedVenue = false
      fromPhoto.insert("venue")
    } else {
      touchedVenue = true
      fromPhoto.remove("venue")
    }
    venue = choice
  }

  private func setDate(_ day: String) {
    touchedDate = true
    fromPhoto.remove("date")
    date = day
  }

  // MARK: - Photo detection

  private var detectStatus: (text: String, working: Bool)? {
    if loadingPhoto { return ("Loading your photo…", true) }
    switch detect {
    case .idle: return nil
    case .reading: return ("Reading the photo…", true)
    case .nearby: return ("Looking for theatres nearby…", true)
    case .text: return ("Reading the text in the photo…", true)
    }
  }

  /// Forget everything the previous photo filled in or found.
  private func clearPhotoResults() {
    run += 1
    if fromPhoto.contains("show") { show = nil }
    if fromPhoto.contains("venue") { venue = nil }
    if fromPhoto.contains("date") { date = Day.today() }
    fromPhoto = []
    photoShows = []
    nearby = []
    place = (nil, nil)
    photoError = nil
    loadingPhoto = false
    detect = .idle
  }

  /// The photo's date at once, then everything else as each answer arrives:
  /// theatres near it, the text on it, the shows and venue that text names.
  /// Each fills only untouched fields, whatever order the answers come in.
  /// `lookup` may already be under way (an import starts the next show's
  /// early); otherwise it starts here.
  private func detect(from data: Data, lookup: PhotoLookup? = nil) async {
    let token = run
    let current = { token == run }
    let clock = ContinuousClock()
    let start = clock.now
    func logStep(_ step: String) {
      let ms = Int((clock.now - start) / .milliseconds(1))
      Log.data.info("photo detect: \(step, privacy: .public) after \(ms, privacy: .public) ms")
    }
    enum Step {
      case nearby(PhotoDetect.Nearby?)
      case text(PhotoText.Reading?)
      case shows(PhotoText.ShowMatches)
      case venue(Venue?)
    }

    let lookup = lookup ?? PhotoLookup(data: data)
    let meta = lookup.meta
    if let day = meta.date, !touchedDate {
      date = day
      fromPhoto.insert("date")
    }

    let hasLocation = meta.lat != nil && meta.lng != nil
    var nearbyPending = hasLocation
    var textPending = true
    var venuePending = false
    var nearbyDone = !hasLocation
    var reading: PhotoText.Reading?
    var textDone = false
    var printedDateSet = false
    var singleNearbyApplied = false
    // The venue field holds a single saved theatre filled before the text was
    // read; a theatre the paper names instead may still replace it.
    var nearbyVenueFill = false
    detect = nearbyPending ? .reading : .text

    func updateStatus() {
      switch (nearbyPending || venuePending, textPending) {
      case (true, true): detect = .reading
      case (true, false): detect = .nearby
      case (false, true): detect = .text
      case (false, false): detect = .idle
      }
    }

    /// A ticket or programme says when and where the show was; a stage photo
    /// only says where the camera was.
    func applyPrintedDate() {
      guard !printedDateSet, !touchedDate, let reading, reading.isPaper else { return }
      let printed = PhotoText.printedDate(in: reading.lines.map(\.text), country: place.country)
      if let printed {
        date = printed
        fromPhoto.insert("date")
        printedDateSet = true
      }
    }

    /// One theatre in range is as good as an answer, unless the paper
    /// was printed for a show seen somewhere else.
    func applySingleNearby() {
      guard nearbyDone, textDone, !singleNearbyApplied else { return }
      singleNearbyApplied = true
      let paper = reading?.isPaper ?? false
      if !paper, nearby.count == 1, !touchedVenue, venue == nil {
        venue = nearby[0]
        fromPhoto.insert("venue")
      }
    }

    await withTaskGroup(of: Step.self) { group in
      if hasLocation { group.addTask { .nearby(await lookup.nearby.value) } }
      group.addTask { .text(await lookup.text.value) }
      for await step in group {
        guard current() else {
          group.cancelAll()
          return
        }
        switch step {
        case .nearby(let found):
          logStep("nearby")
          let found = found ?? PhotoDetect.Nearby()
          nearby = found.candidates
          place = (found.city, found.country)
          nearbyPending = false
          nearbyDone = true
          // Our own table with exactly one theatre in range: fill it now,
          // without waiting for the text.
          if let only = found.singleSaved, !touchedVenue, venue == nil {
            venue = only
            fromPhoto.insert("venue")
            nearbyVenueFill = true
            singleNearbyApplied = true
          }
          // Text may have come first, before the country was known.
          applyPrintedDate()
          applySingleNearby()
        case .text(let read):
          logStep("text")
          reading = read
          textDone = true
          if let read {
            applyPrintedDate()
            group.addTask { .shows(await PhotoText.matchShows(read)) }
            textPending = true
            if read.isPaper, !touchedVenue, venue == nil || nearbyVenueFill {
              group.addTask { .venue(await PhotoText.matchVenue(read)) }
              venuePending = true
            }
          } else {
            textPending = false
          }
          applySingleNearby()
        case .shows(let matches):
          logStep("shows")
          textPending = false
          if let found = matches.confident, !touchedShow, show == nil {
            show = ShowChoice(found)
            fromPhoto.insert("show")
          } else if show == nil {
            photoShows = matches.suggestions
          }
        case .venue(let saved):
          logStep("venue")
          venuePending = false
          if !touchedVenue, venue == nil || nearbyVenueFill, let saved {
            venue = VenueChoice(saved)
            fromPhoto.insert("venue")
            nearbyVenueFill = false
          }
        }
        updateStatus()
      }
    }
    guard current() else { return }
    logStep("done")
    detect = .idle
  }

  // MARK: - Load and save

  private func load() async {
    guard !loaded, let userId = session.userId else { return }
    do {
      context = try await Entries.formContext(userId: userId)
      if !touchedVisibility { visibility = context.visibility }
      if let id = editing?.id {
        savedGalleryCount = (try? await EntryMedia.galleryPhotos(entryID: id).count) ?? 0
        savedCover = try? await EntryMedia.cover(entryID: id)
      }
      if let cover = savedCover, !cover.legacy {
        existingPhoto = try? await supabase.storage.from(EntryMedia.bucket)
          .createSignedURL(path: cover.photo_path, expiresIn: 3600)
      } else if let path = editing?.photoPath {
        existingPhoto = await Entries.signPhotos([path])[path]
      }
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
    run += 1
    started = true
    let token = run
    loadingPhoto = true
    do {
      guard let data = try await item.loadTransferable(type: Data.self) else { throw Photo.Failure.unreadable }
      let lookup = PhotoLookup(data: data)
      let jpeg = try await Task.detached(priority: .userInitiated) {
        try Photo.resizedJPEG(from: data, maxEdge: Photo.storedEdge)
      }.value
      guard token == run else { return }
      try offerCrop(source: jpeg, original: data, lookup: lookup)
    } catch {
      // A newer photo owns the spinner now.
      guard token == run else { return }
      loadingPhoto = false
      photoError = "Couldn’t read that photo. Try another, or fill in the details below."
      detect = .idle
    }
  }

  /// An imported show's photo, read (and its lookup started) ahead of time.
  private func takeImported(_ step: ImportStep) async {
    guard photo == nil, preview == nil else { return }
    let token = run
    detect = .reading
    loadingPhoto = true
    let prepared = await step.photo.value
    // The user picked another photo meanwhile: that one wins.
    guard token == run else { return }
    var encoded: Data?
    if let prepared {
      let original = prepared.original
      encoded = try? await Task.detached(priority: .userInitiated) {
        try Photo.resizedJPEG(from: original, maxEdge: Photo.storedEdge)
      }.value
      guard token == run else { return }
    }
    guard let prepared, let jpeg = encoded else {
      loadingPhoto = false
      photoError = "Couldn’t read this photo. Fill in the details below, or skip this show."
      detect = .idle
      return
    }
    do {
      try offerCrop(source: jpeg, original: prepared.original, lookup: prepared.lookup)
    } catch {
      loadingPhoto = false
      detect = .idle
      photoError = "Couldn’t prepare this photo for cropping."
    }
  }

  private func offerCrop(source: Data, original: Data, lookup: PhotoLookup) throws {
    guard let image = UIImage(data: source)?.cgImage else { throw Photo.Failure.unreadable }
    loadingPhoto = false
    detect = .idle
    cropCandidate = CropCandidate(source: source, image: image, original: original, lookup: lookup)
  }

  private func prepareVideo(_ item: PhotosPickerItem) async {
    guard !loadingVideo, mediaCount < 10, membership.config.mediaVideoEnabled,
          membership.info != nil, membership.canUse("media.video"),
          mediaCount == 0 || membership.config.mediaGalleriesEnabled && membership.canUse("media.multiple") else {
      return
    }
    pendingVideo = nil
    photoError = nil
    loadingVideo = true
    defer { loadingVideo = false }
    do {
      guard let source = try await item.loadTransferable(type: EntryVideoSource.self) else {
        throw CocoaError(.fileReadUnknown)
      }
      videoCandidate = VideoCandidate(source: source.url)
    } catch {
      photoError = "Couldn’t load this video. If it’s in iCloud, download it and try again."
    }
  }

  private func addGalleryPhotos() {
    guard mediaCount < 10, membership.config.mediaGalleriesEnabled, membership.info != nil else { return }
    if membership.canUse("media.multiple") {
      galleryPicker = true
    } else {
      paywall.present(source: .additionalMedia) { resumeGalleryPicker = true }
    }
  }

  private func nextGalleryCrop() async {
    while !pendingGallery.isEmpty && mediaCount < 10 {
      let item = pendingGallery.removeFirst()
      do {
        guard let data = try await item.loadTransferable(type: Data.self) else { throw Photo.Failure.unreadable }
        let source = try await Task.detached(priority: .userInitiated) {
          try Photo.resizedJPEG(from: data, maxEdge: Photo.storedEdge)
        }.value
        guard let image = UIImage(data: source)?.cgImage else { throw Photo.Failure.unreadable }
        cropCandidate = CropCandidate(source: source, image: image, original: nil, lookup: nil, additional: true)
        return
      } catch {
        photoError = "Couldn’t read one of those photos."
      }
    }
    pendingGallery.removeAll()
  }

  private func reopenCrop() async {
    do {
      let source: Data
      let rectangle: [Double]
      let recrop: Bool
      if let croppedPhoto {
        source = croppedPhoto.source
        rectangle = croppedPhoto.rectangle
        recrop = croppedPhoto.recrop
      } else if let id = editing?.id, let savedCover {
        let retained = try await EntryMedia.retainedPhoto(entryID: id, mediaID: savedCover.media_id)
        source = retained.data
        rectangle = retained.rectangle
        recrop = true
      } else { return }

      guard let image = UIImage(data: source)?.cgImage else { throw Photo.Failure.unreadable }
      let size = CGSize(width: image.width, height: image.height)
      let center = CGPoint(x: (rectangle[0] + rectangle[2] / 2) * size.width,
                           y: (rectangle[1] + rectangle[3] / 2) * size.height)
      let initial = EntryPhotoCrop(center: center, side: rectangle[2] * size.width, source: size)
      cropCandidate = CropCandidate(source: source, image: image, original: nil, lookup: nil,
                                    initialCrop: initial, recrop: recrop)
    } catch {
      photoError = "Couldn’t load the original photo."
    }
  }

  private func acceptCrop(_ crop: EntryPhotoCrop, candidate: CropCandidate) {
    do {
      let derivatives = try crop.derivatives(from: candidate.image)
      let size = CGSize(width: candidate.image.width, height: candidate.image.height)
      if candidate.additional {
        additionalPhotos.append(EntryMedia.PhotoDraft(source: candidate.source, display: derivatives.display,
          thumbnail: derivatives.thumbnail, rectangle: crop.normalized(in: size)))
        return
      }
      removedCover = false
      if candidate.original != nil { clearPhotoResults() }
      croppedPhoto = EntryMedia.PhotoDraft(source: candidate.source, display: derivatives.display,
        thumbnail: derivatives.thumbnail, rectangle: crop.normalized(in: size), recrop: candidate.recrop, replacing: savedCover?.media_id)
      photo = derivatives.display
      preview = UIImage(data: derivatives.display)
      existingPhoto = nil
      if let original = candidate.original { Task { await detect(from: original, lookup: candidate.lookup) } }
    } catch {
      photoError = "Couldn’t crop this photo. Try another crop."
    }
  }

  /// For entry_logged. Show detection is gone (#281), so this is "none" with a
  /// photo and "skipped" without; kept for one release so analytics stay comparable.
  private var detectionLabel: String { photo == nil ? "skipped" : "none" }

  private func save() async {
    error = nil
    guard let show else {
      return error = "Pick a show."
    }
    if venue == nil, !planned { return error = "Pick a venue." }
    if let venue, venue.isNew,
      (venue.city ?? "").trimmingCharacters(in: .whitespaces).isEmpty
        || (venue.country ?? "").trimmingCharacters(in: .whitespaces).isEmpty
    {
      return error = "Add the venue’s city and country."
    }
    guard let userId = session.userId else { return error = "You’re signed out. Sign in again to save." }

    // Saving wins over a lookup still on its way: ignore it from here.
    run += 1
    saving = true
    defer { saving = false }
    let draft = Entries.Draft(
      id: editing?.id ?? draftEntryID, show: show, venue: venue, date: date, rating: rating, note: note,
      visibility: visibility, tripIds: tripIds.filter { id in offeredTrips.contains { $0.id == id } }, photo: photo,
      keepPhoto: !removedCover && photo == nil, croppedPhoto: croppedPhoto,
      removedMediaID: removedCover && photo == nil && savedCover?.legacy == false ? savedCover?.media_id : nil)
    do {
      let saved = try await Entries.save(draft, userId: userId, editing: editing)
      if saved.photoFailed && croppedPhoto != nil {
        error = "The entry was saved, but the photo couldn’t upload. Tap Save to retry."
        return
      }
      while let additional = additionalPhotos.first {
        do {
          try await EntryMedia.savePhoto(additional, entryID: saved.id)
          additionalPhotos.removeFirst()
          savedGalleryCount = max(savedGalleryCount, hasPhoto ? 1 : 0) + 1
        } catch {
          self.error = "The entry was saved, but a photo couldn’t upload. Tap Save to retry."
          return
        }
      }
      while var video = preparedVideos.first {
        do {
          try await EntryMedia.saveVideo(&video, entryID: saved.id)
          preparedVideos.removeFirst()
          try? FileManager.default.removeItem(at: video.file)
          savedGalleryCount = max(savedGalleryCount, hasPhoto ? 1 : 0) + 1
        } catch {
          if let index = preparedVideos.firstIndex(where: { $0.requestID == video.requestID }) {
            preparedVideos[index] = video
          }
          self.error = "The entry was saved, but a video couldn’t upload. Tap Save to retry."
          return
        }
      }
      if editing == nil, !planned {
        var props: [String: AnyJSON] = [
          "method": .string(photo != nil ? "photo" : "manual"), "detection": .string(detectionLabel),
          "rated": .bool(rating != nil), "has_note": .bool(!note.trimmingCharacters(in: .whitespaces).isEmpty),
          "platform": .string("ios"),
          "show_source": .string(fromPhoto.contains("show") ? "photo_text" : showSource),
        ]
        if importing != nil { props["source"] = .string("photo_import") }
        Analytics.track(.entryLogged, props)
      }
      if let importing {
        router.dataChanged()
        importing.onSaved(saved.photoFailed)
      } else {
        router.saved(saved.id, isNew: editing == nil, planned: planned, photoFailed: saved.photoFailed)
      }
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

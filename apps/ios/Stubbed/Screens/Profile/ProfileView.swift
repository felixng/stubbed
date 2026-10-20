import SwiftUI

/// The Profile tab, like Contacts' card on a grouped list: who you are
/// (avatar, handle, name, bio), your counts, any follow requests, then your
/// diary or your trips. Select puts the diary in edit mode, with Add to trip
/// and Delete in the bottom bar, as Photos does.
struct ProfileView: View {
  enum Section: String, CaseIterable { case diary = "Diary", trips = "Trips" }

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router

  @State private var section = Section.diary
  @State private var header: Loadable<Header> = .loading
  @State private var diary: Loadable<(entries: [Entry], photos: [String: URL])> = .loading
  @State private var editMode = EditMode.inactive
  @State private var picked: Set<UUID> = []
  @State private var choosingTrip = false
  @State private var confirmDelete = false
  @State private var deleting: Entry?
  @State private var trips: [Trip] = []
  @State private var selectError: String?

  struct Header {
    var profile: Profile
    var counts: FollowCounts
    var shows: Int
    var requests: [Person]
  }

  private var selecting: Bool { editMode.isEditing }

  var body: some View {
    List(selection: $picked) {
      headerSections
      SwiftUI.Section {
        Picker("Profile sections", selection: $section) {
          ForEach(Section.allCases, id: \.self) { Text($0.rawValue) }
        }
        .pickerStyle(.segmented)
        .disabled(selecting)
      }
      .listRowInsets(EdgeInsets())
      .listRowBackground(Color.clear)

      switch section {
      case .diary: diarySections
      case .trips: TripsList()
      }
    }
    .listStyle(.insetGrouped)
    .environment(\.editMode, $editMode)
    .navigationTitle("Profile")
    .toolbar { toolbar }
    // While selecting, the tab bar makes way for Add to Trip and Delete.
    .toolbar(selecting ? .hidden : .visible, for: .tabBar)
    .onChange(of: section) { _, _ in endSelecting() }
    .refreshable { await load() }
    .task(id: router.dataVersion) { await load() }
    .confirmationDialog("Add \(picked.count) to a trip", isPresented: $choosingTrip, titleVisibility: .visible) {
      let dates = chosen.map(\.date).sorted()
      ForEach(trips.filter { trip in dates.allSatisfy(trip.covers) }) { trip in
        Button(trip.name) { Task { await add(to: trip) } }
      }
      Button("New trip") {
        let ids = Array(picked)
        endSelecting()
        router.newTrip(start: dates.first, end: dates.last, entryIds: ids)
      }
    } message: {
      Text("Trips that cover these dates, or a new one.")
    }
    .confirmationDialog(
      "Delete \(picked.count == 1 ? "this show" : "these \(picked.count) shows")?", isPresented: $confirmDelete,
      titleVisibility: .visible
    ) {
      Button("Delete", role: .destructive) { Task { await deleteEntries(chosen) } }
    } message: {
      Text("This can’t be undone.")
    }
    .confirmationDialog(
      "Delete \(deleting?.show.title ?? "this show")?",
      isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
      titleVisibility: .visible, presenting: deleting
    ) { entry in
      Button("Delete", role: .destructive) { Task { await deleteEntries([entry]) } }
    } message: { _ in
      Text("This removes it from your diary, with its photo. It can’t be undone.")
    }
  }

  @ToolbarContentBuilder private var toolbar: some ToolbarContent {
    if section == .diary, !(diary.value?.entries.isEmpty ?? true) {
      ToolbarItem(placement: .topBarLeading) {
        Button(selecting ? "Done" : "Select") {
          withAnimation { if selecting { endSelecting() } else { editMode = .active } }
        }
        .fontWeight(selecting ? .semibold : .regular)
      }
    }
    if selecting {
      ToolbarItem(placement: .bottomBar) {
        Button("Add to trip", systemImage: "suitcase") { choosingTrip = true }
          .labelStyle(.titleAndIcon)
          .disabled(picked.isEmpty)
      }
      ToolbarItem(placement: .status) {
        Text(picked.isEmpty ? "Select shows" : "\(picked.count) selected").font(.subheadline.weight(.semibold))
      }
      ToolbarItem(placement: .bottomBar) {
        Button("Delete", systemImage: "trash", role: .destructive) { confirmDelete = true }
          .disabled(picked.isEmpty)
      }
    } else {
      ToolbarItem(placement: .primaryAction) {
        NavigationLink(value: AppRouter.Route.settings) { Text("Edit") }
          .accessibilityLabel("Edit profile")
      }
      ToolbarItem(placement: .primaryAction) {
        Menu {
          if let handle = header.value?.profile.handle {
            NavigationLink(value: AppRouter.Route.profile(handle: handle)) {
              Label("View public profile", systemImage: "person.crop.circle")
            }
          }
          Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
            Task { await session.signOut() }
          }
        } label: {
          Label("Account", systemImage: "ellipsis.circle")
        }
      }
    }
  }

  private var chosen: [Entry] { diary.value?.entries.filter { picked.contains($0.id) } ?? [] }

  // MARK: - Header

  @ViewBuilder private var headerSections: some View {
    switch header {
    case .loading:
      PlaceholderRows(count: 1)
    case .failed(let message):
      SwiftUI.Section { Text(message).foregroundStyle(.secondary) }
    case .loaded(let h):
      SwiftUI.Section {
        VStack(alignment: .leading, spacing: Space.m) {
          HStack(spacing: Space.l) {
            Avatar(name: h.profile.name, url: h.profile.avatarURL, size: 64)
            VStack(alignment: .leading, spacing: 2) {
              Text(verbatim: "@\(h.profile.handle)")
                .font(.title2.bold())
                .lineLimit(1)
                .accessibilityAddTraits(.isHeader)
              if let name = h.profile.displayName, !name.isEmpty {
                Text(name).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
              }
              if h.profile.isPrivate {
                Label("Private profile", systemImage: "lock.fill").font(.footnote).foregroundStyle(.secondary)
              }
            }
          }
          if let bio = h.profile.bio, !bio.isEmpty {
            Text(bio).font(.body)
          }
        }
        .padding(.vertical, Space.xs)
        LabeledContent("Shows", value: h.shows.formatted())
        NavigationLink(value: AppRouter.Route.follows(handle: h.profile.handle, list: .followers)) {
          LabeledContent("Followers", value: h.counts.followers.formatted())
        }
        NavigationLink(value: AppRouter.Route.follows(handle: h.profile.handle, list: .following)) {
          LabeledContent("Following", value: h.counts.following.formatted())
        }
      }
      .selectionDisabled()
      // Only private profiles get requests; going public approves them all.
      if !h.requests.isEmpty {
        SwiftUI.Section(h.requests.count == 1 ? "1 follow request" : "\(h.requests.count) follow requests") {
          FollowRequests(people: h.requests)
        }
        .selectionDisabled()
      }
    }
  }

  // MARK: - Diary

  @ViewBuilder private var diarySections: some View {
    switch diary {
    case .loading:
      PlaceholderRows()
    case .failed(let message):
      EmptyState(title: "Couldn’t load your diary", systemImage: "wifi.exclamationmark") { Text(message) }
        .listRowBackground(Color.clear)
    case .loaded(let data):
      // Upcoming soonest first; the shows you've seen newest first.
      let upcoming = Array(data.entries.filter(\.planned).reversed())
      let seen = data.entries.filter { !$0.planned }
      if data.entries.isEmpty {
        EmptyState(title: "No shows yet") {
          Text("Going to one soon? Track it with its date.")
          Button("Add your first theatre visit") { router.startLog() }
            .buttonStyle(.borderedProminent)
            .padding(.top, Space.s)
        }
        .listRowBackground(Color.clear)
      } else {
        SwiftUI.Section("Upcoming") {
          ForEach(upcoming) { row($0, photos: data.photos) }
          if !selecting {
            Button("Plan a trip", systemImage: "plus") { router.newTrip() }
          }
        }
        SwiftUI.Section {
          ForEach(seen) { row($0, photos: data.photos) }
        } header: {
          Text("Seen")
        } footer: {
          if let selectError {
            Text(selectError).foregroundStyle(.red)
          } else if seen.isEmpty {
            Text("Your shows appear here once you’ve been.")
          }
        }
      }
    }
  }

  /// A diary row: opens the entry; swipe or long press to edit or delete.
  private func row(_ entry: Entry, photos: [String: URL]) -> some View {
    NavigationLink(value: AppRouter.Route.entry(entry.id)) {
      EntryRow(entry: entry, photo: entry.photoPath.flatMap { photos[$0] })
    }
    .tag(entry.id)
    .swipeActions {
      // Red but not role: .destructive, so the row stays while the dialog asks.
      Button("Delete", systemImage: "trash") { deleting = entry }.tint(.red)
      Button("Edit", systemImage: "pencil") { router.edit(entry) }
    }
    .contextMenu {
      Button("Edit", systemImage: "pencil") { router.edit(entry) }
      Button("Delete", systemImage: "trash", role: .destructive) { deleting = entry }
    }
  }

  private func endSelecting() {
    editMode = .inactive
    picked = []
    selectError = nil
  }

  private func add(to trip: Trip) async {
    do {
      try await Trips.add(Array(picked), to: trip.id)
      endSelecting()
      router.dataChanged()
      router.profilePath.append(.trip(trip.id))
    } catch {
      selectError = "Couldn’t add them to the trip. Try again."
    }
  }

  private func deleteEntries(_ entries: [Entry]) async {
    do {
      for entry in entries { try await Entries.delete(entry) }
      endSelecting()
      router.dataChanged()
    } catch {
      selectError = "Couldn’t delete them. Try again."
      router.dataChanged()
    }
  }

  // MARK: - Load

  private func load() async {
    guard let userId = session.userId else { return }
    async let profile = Profiles.profile(userId)
    async let counts = Profiles.followCounts(userId)
    async let shows = Profiles.loggedCount(userId)
    async let requests = Follows.requests(userId)
    async let entries = Profiles.ownEntries(userId)
    async let ownTrips = Trips.list(userId)
    do {
      header = .loaded(
        Header(
          profile: try await profile, counts: await counts, shows: await shows, requests: (try? await requests) ?? []))
    } catch {
      if header.value == nil { header = .failed("Couldn’t load your profile.") }
    }
    trips = (try? await ownTrips)?.map(\.trip) ?? trips
    do {
      diary = .loaded(try await entries)
    } catch {
      if diary.value == nil { diary = .failed("Check your connection and try again.") }
    }
  }
}

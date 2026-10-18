import SwiftUI

/// One of your entries, like the web's /app/entries/[id]. The share cards go
/// at the top (#69); below them, what the cards don't show: type, note,
/// trips and visibility. Edit opens the log form; Delete asks first.
struct EntryView: View {
  let id: UUID
  var notice: AppRouter.Notice?

  @Environment(AppRouter.self) private var router
  @Environment(\.dismiss) private var dismiss
  @State private var state: Loadable<Entry> = .loading
  @State private var photo: URL?
  @State private var cards: [RenderedCard]?
  @State private var cardsFailed = false
  @State private var share: ShareInfo?
  @State private var reactions: Reactions?

  /// What the share screen needs beyond the entry: the caption and the
  /// public page, when there is one.
  struct ShareInfo {
    let text: String
    let link: URL?
  }
  @State private var confirmDelete = false
  @State private var deleting = false
  @State private var deleteError: String?

  var body: some View {
    Screen(title: "") {
      switch state {
      case .loading:
        LoadingText()
      case .failed(let message):
        EmptyState(title: "Couldn’t load this show", systemImage: "exclamationmark.triangle") { Text(message) }
      case .loaded(let entry):
        content(entry)
      }
    }
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      if let entry = state.value {
        ToolbarItem(placement: .primaryAction) {
          Button("Edit") { router.edit(entry) }
        }
      }
    }
    .task(id: router.dataVersion) { await load() }
  }

  @ViewBuilder private func content(_ entry: Entry) -> some View {
    if let notice {
      banner(notice, planned: entry.planned)
    }

    if entry.planned {
      Label {
        Text("You’re going on \(Day.formatWeekday(entry.date)). Once you’ve been, track it with your rating and share it.")
          .font(.subheadline)
      } icon: {
        Image(systemName: "calendar").foregroundStyle(Palette.tintText)
      }
      .padding(Space.l)
      .frame(maxWidth: .infinity, alignment: .leading)
      .groupedCard()
    } else if let share {
      ShareCarousel(subject: .show, cards: cards, failed: cardsFailed, text: share.text, link: share.link)
    }

    VStack(alignment: .leading, spacing: Space.m) {
      VStack(alignment: .leading, spacing: Space.xs) {
        Text(entry.show.title)
          .font(.title2.bold())
          .accessibilityAddTraits(.isHeader)
        Text([entry.show.type.label, entry.whereText].compactMap { $0 }.joined(separator: " · "))
          .font(.subheadline)
          .foregroundStyle(.secondary)
        Text(Day.formatLong(entry.date))
          .font(.subheadline)
          .foregroundStyle(.secondary)
        if let rating = entry.rating {
          RatingStars(value: rating, size: 18).padding(.top, Space.xs)
        }
      }
      if let note = entry.note {
        Text(note).font(.body)
      }
    }
    .padding(Space.l)
    .frame(maxWidth: .infinity, alignment: .leading)
    .groupedCard()

    VStack(spacing: 0) {
      // Public shows have a page with likes and comments.
      if let reactions, entry.visibility == .public, !entry.planned {
        NavigationLink(value: AppRouter.Route.publicEntry(entry.id, comments: true)) {
          row(
            reactions.likes + reactions.comments == 0
              ? "No likes or comments yet"
              : "\(reactions.likes) \(reactions.likes == 1 ? "like" : "likes") · \(reactions.comments) \(reactions.comments == 1 ? "comment" : "comments")",
            systemImage: "heart", chevron: true)
        }
        .pressableRow()
        Divider().padding(.leading, Space.l + 28 + Space.m)
      }
      ForEach(entry.trips, id: \.id) { trip in
        NavigationLink(value: AppRouter.Route.trip(trip.id)) {
          row(trip.name, systemImage: "suitcase", chevron: true)
        }
        .pressableRow()
        Divider().padding(.leading, Space.l + 28 + Space.m)
      }
      row(
        entry.planned
          ? "Only you can see upcoming shows."
          : entry.visibility == .public ? "Public" : "Private. Sharing the image doesn’t change that.",
        systemImage: entry.visibility == .public && !entry.planned ? "globe" : "lock",
        secondary: true)
    }
    .groupedCard()

    Button(role: .destructive) {
      confirmDelete = true
    } label: {
      Text(deleting ? "Deleting…" : "Delete")
        .font(.body)
        .frame(maxWidth: .infinity, minHeight: Space.touch)
    }
    .pressableRow()
    .foregroundStyle(.red)
    .groupedCard()
    .disabled(deleting)
    .confirmationDialog("Delete \(entry.show.title)?", isPresented: $confirmDelete, titleVisibility: .visible) {
      Button("Delete", role: .destructive) { Task { await delete(entry) } }
    } message: {
      Text("This removes it from your diary, with its photo. It can’t be undone.")
    }
    if let deleteError {
      Text(deleteError).font(.footnote).foregroundStyle(.red)
    }
  }

  /// A row in the details list: an icon, the text and, if it opens
  /// something, a chevron.
  private func row(_ text: String, systemImage: String, chevron: Bool = false, secondary: Bool = false) -> some View {
    HStack(spacing: Space.m) {
      Image(systemName: systemImage)
        .font(.body)
        .foregroundStyle(secondary ? AnyShapeStyle(.secondary) : AnyShapeStyle(Palette.tintText))
        .frame(width: 28)
        .accessibilityHidden(true)
      Text(text)
        .font(secondary ? .subheadline : .body)
        .foregroundStyle(secondary ? .secondary : .primary)
        .multilineTextAlignment(.leading)
      Spacer(minLength: 0)
      if chevron { RowChevron() }
    }
    .padding(.horizontal, Space.l)
    .padding(.vertical, Space.m)
    .frame(minHeight: Space.touch)
  }

  private func banner(_ notice: AppRouter.Notice, planned: Bool) -> some View {
    let failed = notice == .photoFailed
    return Label {
      Text(
        failed
          ? "Saved, but the photo didn’t upload. Edit the entry to add it again."
          : planned ? "Added to Upcoming in your diary." : "Saved to your diary. Share it?"
      )
      .font(.subheadline.weight(failed ? .regular : .medium))
    } icon: {
      Image(systemName: failed ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
        .foregroundStyle(failed ? Color.orange : Color.green)
    }
    .padding(.horizontal, Space.l)
    .padding(.vertical, Space.m)
    .frame(maxWidth: .infinity, alignment: .leading)
    .groupedCard()
    .accessibilityElement(children: .combine)
  }

  private func load() async {
    do {
      let entry = try await Entries.entry(id)
      if let path = entry.photoPath {
        photo = await Entries.signPhotos([path])[path]
      } else {
        photo = nil
      }
      state = .loaded(entry)
      reactions = await ReactionsAPI.load([entry.id])[entry.id]
      if !entry.planned { await drawCards(entry) }
    } catch {
      // Deleted, or not yours: nothing to show.
      if case .loaded = state { return }
      state = .failed("It may have been deleted.")
    }
  }

  /// Draws the cards on the device, like the web: the photo never leaves
  /// it, and the counts come from Postgres.
  private func drawCards(_ entry: Entry) async {
    cardsFailed = false
    do {
      async let stats = ShareCards.stats(entry.id)
      async let owner = Profiles.profile(entry.userId)
      async let image = ShareCards.image(photo)
      let (s, profile, picture) = try await (stats, owner, image)
      let data = EntryCardData(
        title: entry.show.title, venue: entry.venue?.name, whereText: entry.whereText ?? "",
        date: Day.format(entry.date), year: Int(entry.date.prefix(4)) ?? 0, rating: entry.rating,
        showOfYear: s.show_of_year, venueVisit: s.venue_visit, timesSeen: s.times_seen, handle: profile.handle)
      let caption = entry.venue.map { "\(entry.show.title) at \($0.name)" } ?? entry.show.title
      let isPublic = entry.visibility == .public && !profile.isPrivate
      share = ShareInfo(
        text: "\(caption). Tracked on Stubbed \(stubbedInstagram)",
        link: isPublic ? AppConfig.current.webURL.appendingPathComponent("e/\(entry.id.uuidString.lowercased())") : nil)
      cards = try ShareCards.entryCards(data, photo: picture)
    } catch {
      Log.app.error("Drawing the share cards failed: \(error.localizedDescription, privacy: .public)")
      cardsFailed = true
      if share == nil { share = ShareInfo(text: entry.show.title, link: nil) }
    }
  }

  private func delete(_ entry: Entry) async {
    deleting = true
    defer { deleting = false }
    do {
      try await Entries.delete(entry)
      dismiss()
      router.dataChanged()
    } catch {
      deleteError = "Couldn’t delete it. Try again."
    }
  }
}

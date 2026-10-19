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
    Group {
      switch state {
      case .loading:
        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
      case .failed(let message):
        EmptyState(title: "Couldn’t load this show", systemImage: "exclamationmark.triangle") { Text(message) }
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      case .loaded(let entry):
        form(entry)
      }
    }
    .background(Color(.systemGroupedBackground))
    .navigationTitle(state.value?.show.title ?? "")
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

  /// The show, then its share cards, then likes, trips and who can see it,
  /// then Delete on its own.
  private func form(_ entry: Entry) -> some View {
    Form {
      if let notice {
        Section { banner(notice, planned: entry.planned) }
      }

      Section {
        VStack(alignment: .leading, spacing: Space.xs) {
          Text(entry.show.title)
            .font(.title3.bold())
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
        .padding(.vertical, Space.xs)
        if let note = entry.note {
          Text(note).font(.body)
        }
        if entry.planned {
          Label(
            "You’re going on \(Day.formatWeekday(entry.date)). Once you’ve been, track it with your rating and share it.",
            systemImage: "calendar"
          )
          .font(.subheadline)
        }
      }

      if !entry.planned, let share {
        Section {
          ShareCarousel(subject: .show, cards: cards, failed: cardsFailed, text: share.text, link: share.link)
            .padding(.horizontal, Space.l)
        }
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
      }

      Section {
        // Public shows have a page with likes and comments.
        if let reactions, entry.visibility == .public, !entry.planned {
          NavigationLink(value: AppRouter.Route.publicEntry(entry.id, comments: true)) {
            Label(
              reactions.likes + reactions.comments == 0
                ? "No likes or comments yet"
                : "\(reactions.likes) \(reactions.likes == 1 ? "like" : "likes") · \(reactions.comments) \(reactions.comments == 1 ? "comment" : "comments")",
              systemImage: "heart")
          }
        }
        ForEach(entry.trips, id: \.id) { trip in
          NavigationLink(value: AppRouter.Route.trip(trip.id)) {
            Label(trip.name, systemImage: "suitcase")
          }
        }
        Label(
          entry.planned
            ? "Only you can see upcoming shows."
            : entry.visibility == .public ? "Public" : "Private. Sharing the image doesn’t change that.",
          systemImage: entry.visibility == .public && !entry.planned ? "globe" : "lock"
        )
        .foregroundStyle(.secondary)
      }

      Section {
        Button(deleting ? "Deleting…" : "Delete show", role: .destructive) { confirmDelete = true }
          .disabled(deleting)
          .confirmationDialog("Delete \(entry.show.title)?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await delete(entry) } }
          } message: {
            Text("This removes it from your diary, with its photo. It can’t be undone.")
          }
      } footer: {
        if let deleteError { Text(deleteError).foregroundStyle(.red) }
      }
    }
    .tabBarClearance()
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

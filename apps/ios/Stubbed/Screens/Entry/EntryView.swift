import Supabase
import SwiftUI

/// One of your entries, with its photo, show details and sharing actions.
/// Edit opens the log form; Delete asks first.
struct EntryView: View {
  let id: UUID
  var notice: AppRouter.Notice?

  @Environment(AppRouter.self) private var router
  @Environment(Membership.self) private var membership
  @Environment(\.dismiss) private var dismiss
  @State private var state: Loadable<Entry> = .loading
  @State private var photo: URL?
  @State private var cards: [RenderedCard]?
  @State private var cardsFailed = false
  /// The caption and public page for the share screen.
  @State private var share: EntryShare.Info?
  @State private var reactions: Reactions?
  @State private var sharing = false
  /// After saving a new show the Share screen opens once, as Hevy's does.
  @State private var offeredShare = false
  @State private var confirmDelete = false
  @State private var deleting = false
  @State private var deleteError: String?

  var body: some View {
    Group {
      switch state {
      case .loading:
        List { PlaceholderRows(count: 3) }
      case .failed(let message):
        EmptyState(title: "Couldn’t load this show", systemImage: "exclamationmark.triangle") { Text(message) }
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      case .loaded(let entry):
        form(entry)
      }
    }
    .background(Color(.systemGroupedBackground))
    .navigationTitle("Show")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      if let entry = state.value {
        ToolbarItem(placement: .primaryAction) {
          Button("Edit") { router.edit(entry) }
        }
        if !entry.planned {
          ToolbarItem(placement: .primaryAction) {
            Button("Share", systemImage: "square.and.arrow.up") { sharing = true }
              .disabled(share == nil)
          }
        }
      }
    }
    .task(id: "\(router.dataVersion)-\(membership.version)") { await load() }
    .sheet(isPresented: $sharing) {
      if let share {
        ShareScreen {
          ShareCarousel(
            subject: .show, cards: cards, failed: cardsFailed, text: share.text, link: share.link)
        }
      }
    }
    .onChange(of: share != nil) { _, ready in
      if ready, notice == .saved, !offeredShare {
        offeredShare = true
        sharing = true
      }
    }
  }

  /// The show, then the Share row, then likes, trips and who can see it,
  /// then Delete on its own.
  private func form(_ entry: Entry) -> some View {
    Form {
      if let photo {
        Section {
          Color.clear
            .aspectRatio(4 / 5, contentMode: .fit)
            .overlay { RemoteImage(url: photo) }
            .clipped()
            .accessibilityElement()
            .accessibilityLabel("Photo from \(entry.show.title)")
            .accessibilityIdentifier("entry-photo")
        }
        .listRowInsets(EdgeInsets())
      }

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
            "You’re going on \(Day.formatWeekday(entry.date)). Once you’ve been, log it with your rating and share it.",
            systemImage: "calendar"
          )
          .font(.subheadline)
        }
      }

      if photo == nil {
        Section {
          Button("Add a photo", systemImage: "photo.badge.plus") { router.edit(entry) }
        }
      }

      if !entry.planned, share != nil {
        Section {
          ShareRow(title: "Share this show", preview: cards?.first?.image) { sharing = true }
        }
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
          : planned ? "Added to Upcoming in your diary." : "Saved to your diary."
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
      if let cover = try? await EntryMedia.cover(entryID: entry.id), !cover.legacy {
        photo = try? await supabase.storage.from(EntryMedia.bucket)
          .createSignedURL(path: cover.photo_path, expiresIn: 3600)
      } else if let path = entry.photoPath {
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

  /// Draws the cards on the device (see `EntryShare.prepare`).
  private func drawCards(_ entry: Entry) async {
    let prepared = await EntryShare.prepare(entry, photo: photo)
    share = prepared.info
    cards = prepared.cards
    cardsFailed = prepared.cards == nil
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

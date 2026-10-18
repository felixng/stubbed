import SwiftUI

/// One show as a post: who and when, the show and where (tap for the
/// show), stars, note, photo and trips, then Like and Comment on public
/// shows. An inset grouped card; used by the feed, profiles and trips.
struct PostCard: View {
  let entry: Entry
  let owner: Person
  let photo: URL?
  /// Your own show opens your entry screen; others' open their public page.
  var mine = false
  /// Leaves out the header on a trip's page, which already says whose it is.
  var inTrip: UUID?
  /// Trip chips link to trip pages only where they'd open.
  var linkTrips = true
  var reactions: Reactions?

  @Environment(AppSession.self) private var session
  @State private var shown: Reactions?
  @State private var writing = false
  @State private var likeError: String?

  private var route: AppRouter.Route { mine ? .entry(entry.id) : .publicEntry(entry.id) }
  private var date: String { Day.formatPost(entry.date) }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if inTrip == nil { header }

      NavigationLink(value: route) { show }
        .pressableRow()

      let trips = entry.trips.filter { $0.id != inTrip }
      if !trips.isEmpty { tripChips(trips) }

      if let state = shown ?? reactions {
        Divider().padding(.leading, Space.l)
        actions(state)
      }
    }
    .groupedCard()
    .onChange(of: reactions) { _, _ in shown = nil }
  }

  // MARK: - Parts

  private var header: some View {
    NavigationLink(value: AppRouter.Route.profile(handle: owner.handle)) {
      HStack(spacing: Space.m) {
        Avatar(name: owner.name, url: owner.avatarURL, size: 36)
        VStack(alignment: .leading, spacing: 1) {
          Text(verbatim: "@\(owner.handle)")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.primary)
            .lineLimit(1)
          Text(date)
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
        Spacer(minLength: 0)
        if mine, entry.visibility == .private {
          Label("Private", systemImage: "lock.fill")
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
        }
      }
      .padding(.horizontal, Space.l)
      .padding(.top, Space.l)
      .padding(.bottom, Space.s)
    }
    .pressableRow()
    .accessibilityLabel("@\(owner.handle), \(date)")
    .accessibilityHint("Opens their profile")
  }

  private var show: some View {
    VStack(alignment: .leading, spacing: Space.m) {
      HStack(alignment: .firstTextBaseline, spacing: Space.s) {
        VStack(alignment: .leading, spacing: 2) {
          Text(entry.show.title)
            .font(.title3.bold())
            .foregroundStyle(.primary)
            .multilineTextAlignment(.leading)
          Text([entry.show.type.label, entry.whereText].compactMap { $0 }.joined(separator: " · "))
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.leading)
        }
        Spacer(minLength: 0)
        RowChevron()
      }
      if inTrip != nil {
        Text(date).font(.footnote).foregroundStyle(.secondary)
      }
      if let rating = entry.rating { RatingStars(value: rating, size: 17) }
      if let note = entry.note {
        Text(note)
          .font(.body)
          .foregroundStyle(.primary)
          .multilineTextAlignment(.leading)
      }
      if let photo {
        AsyncImage(url: photo) { $0.resizable().scaledToFill() } placeholder: { Color(.tertiarySystemFill) }
          .frame(maxWidth: .infinity)
          .aspectRatio(4 / 5, contentMode: .fit)
          .frame(maxHeight: 460)
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
          .accessibilityLabel("Photo from \(entry.show.title)")
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, Space.l)
    .padding(.top, inTrip == nil ? Space.xs : Space.l)
    .padding(.bottom, Space.l)
  }

  private func tripChips(_ trips: [Entry.TripRef]) -> some View {
    FlowLayout(spacing: Space.s) {
      ForEach(trips, id: \.id) { trip in
        if linkTrips {
          NavigationLink(value: mine ? AppRouter.Route.trip(trip.id) : .publicTrip(trip.id)) { tripChip(trip.name) }
            .buttonStyle(.borderless)
        } else {
          tripChip(trip.name)
        }
      }
    }
    .padding(.horizontal, Space.l)
    .padding(.bottom, Space.l)
  }

  private func tripChip(_ name: String) -> some View {
    Label(name, systemImage: "suitcase")
      .font(.footnote.weight(.medium))
      .foregroundStyle(.primary)
      .padding(.horizontal, Space.m)
      .padding(.vertical, 6)
      .background(Color(.tertiarySystemFill), in: .capsule)
  }

  /// Like and Comment. A like shows at once and writes in the background.
  private func actions(_ state: Reactions) -> some View {
    HStack(spacing: Space.xl) {
      Button {
        Task { await toggleLike(state) }
      } label: {
        Label {
          Text(state.likes > 0 ? "\(state.likes)" : "Like").monospacedDigit()
        } icon: {
          Image(systemName: state.liked ? "heart.fill" : "heart")
            .foregroundStyle(state.liked ? Palette.tint : .secondary)
            .contentTransition(.symbolEffect(.replace))
        }
        .frame(minHeight: Space.touch)
      }
      .buttonStyle(.borderless)
      .sensoryFeedback(.selection, trigger: state.liked)
      .accessibilityLabel("Like")
      .accessibilityValue("\(state.likes) \(state.likes == 1 ? "like" : "likes")")
      .accessibilityAddTraits(state.liked ? .isSelected : [])

      NavigationLink(value: AppRouter.Route.publicEntry(entry.id, comments: true)) {
        Label {
          Text(state.comments > 0 ? "\(state.comments)" : "Comment").monospacedDigit()
        } icon: {
          Image(systemName: "bubble.left").foregroundStyle(.secondary)
        }
        .frame(minHeight: Space.touch)
      }
      .buttonStyle(.borderless)
      .accessibilityLabel("Comment")
      .accessibilityValue("\(state.comments) \(state.comments == 1 ? "comment" : "comments")")

      Spacer(minLength: 0)
      if let likeError {
        Text(likeError).font(.footnote).foregroundStyle(.red)
      }
    }
    .font(.subheadline.weight(.medium))
    .foregroundStyle(.secondary)
    .padding(.horizontal, Space.l)
  }

  private func toggleLike(_ state: Reactions) async {
    guard !writing, let userId = session.userId else { return }
    writing = true
    defer { writing = false }
    likeError = nil
    let liked = !state.liked
    shown = Reactions(likes: max(0, state.likes + (liked ? 1 : -1)), comments: state.comments, liked: liked)
    do {
      try await ReactionsAPI.setLiked(liked, entryId: entry.id, userId: userId)
    } catch {
      shown = state
      likeError = "Couldn’t update. Try again."
    }
  }
}

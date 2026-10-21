import SwiftUI

/// One show as a post, photo first like Instagram or Hevy: who and when,
/// the photo at the card's full width, then the show (title, venue and
/// stars together) and the note, and one footer row with the like and
/// comment counts on the left and its trip on the right. Without a photo
/// it's a text post. The whole card opens the show; the avatar, counts and trip
/// pills are their own targets. Used by the feed, profiles and trips.
struct PostCard: View {
  let entry: Entry
  let owner: Person
  let photo: URL?
  /// Your own show opens your entry screen; others' open their public page.
  var mine = false
  /// Leaves out the header on a trip's page, which already says whose it is.
  var inTrip: UUID?
  /// Trip pills link to trip pages only where they'd open.
  var linkTrips = true
  var reactions: Reactions?
  /// False on the show's own page, where the card has nowhere to go.
  var opensShow = true

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var shown: Reactions?
  @State private var writing = false
  @State private var likeError: String?

  private var route: AppRouter.Route { mine ? .entry(entry.id) : .publicEntry(entry.id) }
  private var date: String { Day.formatPost(entry.date) }

  // Links are buttons that push through the router, not NavigationLinks: in
  // a List, every NavigationLink in a row would get a disclosure chevron.
  var body: some View {
    Group {
      if opensShow {
        Button { router.open(route) } label: { card }
          .buttonStyle(CardPressStyle())
      } else {
        card
      }
    }
    .onChange(of: reactions) { _, _ in shown = nil }
  }

  /// Photo first, as on Instagram and Hevy: the header, the photo across
  /// the card's full width, then the show and note, then the footer.
  private var card: some View {
    VStack(alignment: .leading, spacing: 0) {
      if inTrip == nil {
        header.padding(.horizontal, Space.l).padding(.vertical, Space.m)
      }
      if let photo {
        // 4:5, the tallest crop Instagram uses, so the photo leads the card.
        Color.clear
          .aspectRatio(4 / 5, contentMode: .fit)
          .overlay { RemoteImage(url: photo) }
          .clipped()
          .accessibilityElement()
          .accessibilityLabel("Photo from \(entry.show.title)")
      }
      VStack(alignment: .leading, spacing: Space.s) {
        show
        footer
      }
      .padding(.horizontal, Space.l)
      .padding(.top, photo == nil && inTrip == nil ? 0 : Space.m)
      .padding(.bottom, Space.s)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .groupedCard()
  }

  private var header: some View {
    HStack(spacing: Space.m) {
      Button { router.open(.profile(handle: owner.handle)) } label: {
        HStack(spacing: Space.m) {
          Avatar(name: owner.name, url: owner.avatarURL, size: 32)
          VStack(alignment: .leading, spacing: 0) {
            Text(verbatim: "@\(owner.handle)")
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(.primary)
              .lineLimit(1)
            Text(date)
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }
      }
      .buttonStyle(.plain)
      .accessibilityLabel("@\(owner.handle), \(date)")
      .accessibilityHint("Opens their profile")
      Spacer(minLength: 0)
      if mine, entry.visibility == .private {
        Label("Private", systemImage: "lock.fill")
          .font(.caption.weight(.medium))
          .foregroundStyle(.secondary)
      }
    }
  }

  /// Title, where and stars together, then the note.
  private var show: some View {
    VStack(alignment: .leading, spacing: Space.xs) {
      VStack(alignment: .leading, spacing: 2) {
        Text(entry.show.title)
          .font(.headline)
          .foregroundStyle(.primary)
        Text([entry.whereText, inTrip != nil ? date : nil].compactMap { $0 }.joined(separator: " · "))
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }
      if let rating = entry.rating {
        RatingStars(value: rating, size: 15).padding(.vertical, 2)
      }
      if let note = entry.note {
        Text(note)
          .font(.subheadline)
          .foregroundStyle(.primary)
          .lineLimit(6)
      }
    }
    .multilineTextAlignment(.leading)
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  /// One row: counts on the left, trip pills on the right, no rule above.
  @ViewBuilder private var footer: some View {
    let trips = entry.trips.filter { $0.id != inTrip }
    let state = shown ?? reactions
    if state != nil || !trips.isEmpty {
      HStack(spacing: Space.s) {
        if let state { metrics(state) }
        Spacer(minLength: Space.s)
        if let trip = trips.first {
          Group {
            if linkTrips {
              Button { router.open(mine ? .trip(trip.id) : .publicTrip(trip.id)) } label: { pill(trip.name) }
                .buttonStyle(.plain)
            } else {
              pill(trip.name)
            }
          }
          if trips.count > 1 {
            Text("+\(trips.count - 1)")
              .font(.caption.weight(.medium))
              .foregroundStyle(.secondary)
              .accessibilityLabel("and \(trips.count - 1) more \(trips.count == 2 ? "trip" : "trips")")
          }
        }
      }
      .frame(minHeight: Space.touch)
    }
    if let likeError {
      Text(likeError).font(.caption).foregroundStyle(.red)
    }
  }

  private func pill(_ name: String) -> some View {
    Label(name, systemImage: "suitcase")
      .font(.caption.weight(.medium))
      .foregroundStyle(.secondary)
      .lineLimit(1)
      .padding(.horizontal, Space.m)
      .padding(.vertical, 6)
      .background(Color(.tertiarySystemFill), in: Capsule())
  }

  /// Heart and bubble badges with their counts. A like shows at once and
  /// writes in the background.
  private func metrics(_ state: Reactions) -> some View {
    HStack(spacing: Space.l) {
      Button {
        Task { await toggleLike(state) }
      } label: {
        metric(state.likes, systemImage: state.liked ? "heart.fill" : "heart", tint: state.liked ? Palette.tint : nil)
      }
      .buttonStyle(.plain)
      .sensoryFeedback(.selection, trigger: state.liked)
      .accessibilityLabel("Like")
      .accessibilityValue("\(state.likes) \(state.likes == 1 ? "like" : "likes")")
      .accessibilityAddTraits(state.liked ? .isSelected : [])

      Button { router.open(.publicEntry(entry.id, comments: true)) } label: {
        metric(state.comments, systemImage: "bubble.left", tint: nil)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Comment")
      .accessibilityValue("\(state.comments) \(state.comments == 1 ? "comment" : "comments")")
    }
  }

  private func metric(_ count: Int, systemImage: String, tint: Color?) -> some View {
    HStack(spacing: 5) {
      Image(systemName: systemImage)
        .foregroundStyle(tint.map { AnyShapeStyle($0) } ?? AnyShapeStyle(.secondary))
        .contentTransition(.symbolEffect(.replace))
      Text(count.formatted())
        .foregroundStyle(.secondary)
        .monospacedDigit()
        .contentTransition(.numericText())
    }
    .font(.subheadline.weight(.medium))
    .frame(minWidth: Space.touch, minHeight: Space.touch, alignment: .leading)
    .contentShape(.rect)
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

import SwiftUI

/// One show as a post: who and when, the photo edge to edge, the show,
/// stars and note, then its trips and the like and comment counts along the
/// bottom. The whole card opens the show; the avatar, trip pills and counts
/// are their own targets. Used by the feed, profiles and trips.
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

  @Environment(AppSession.self) private var session
  @State private var shown: Reactions?
  @State private var writing = false
  @State private var likeError: String?

  private var route: AppRouter.Route { mine ? .entry(entry.id) : .publicEntry(entry.id) }
  private var date: String { Day.formatPost(entry.date) }

  var body: some View {
    NavigationLink(value: route) {
      VStack(alignment: .leading, spacing: 0) {
        if inTrip == nil { header }
        if let photo { photoView(photo) }
        show
        footer
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .groupedCard()
    }
    .buttonStyle(CardPressStyle())
    .onChange(of: reactions) { _, _ in shown = nil }
  }

  // MARK: - Parts

  private var header: some View {
    HStack(spacing: Space.m) {
      NavigationLink(value: AppRouter.Route.profile(handle: owner.handle)) {
        HStack(spacing: Space.m) {
          Avatar(name: owner.name, url: owner.avatarURL, size: 36)
          VStack(alignment: .leading, spacing: 1) {
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
    .padding(.horizontal, Space.l)
    .padding(.vertical, Space.m)
  }

  /// Full card width, no inset or corners of its own: the card clips it.
  private func photoView(_ url: URL) -> some View {
    Color(.tertiarySystemFill)
      .aspectRatio(4 / 5, contentMode: .fit)
      .frame(maxWidth: .infinity, maxHeight: 460)
      .overlay {
        AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Color.clear }
      }
      .clipped()
      .accessibilityLabel("Photo from \(entry.show.title)")
  }

  private var show: some View {
    VStack(alignment: .leading, spacing: Space.s) {
      VStack(alignment: .leading, spacing: 2) {
        Text(entry.show.title)
          .font(.headline)
          .foregroundStyle(.primary)
        Text([entry.show.type.label, entry.whereText].compactMap { $0 }.joined(separator: " · "))
          .font(.subheadline)
          .foregroundStyle(.secondary)
        if inTrip != nil {
          Text(date).font(.subheadline).foregroundStyle(.secondary)
        }
      }
      if let rating = entry.rating { RatingStars(value: rating, size: 15) }
      if let note = entry.note {
        Text(note)
          .font(.subheadline)
          .foregroundStyle(.primary)
      }
    }
    .multilineTextAlignment(.leading)
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, Space.l)
    .padding(.top, inTrip == nil && photo == nil ? 0 : Space.m)
  }

  /// Trip pills on the left, like and comment counts on the right, with
  /// no rule above them.
  @ViewBuilder private var footer: some View {
    let trips = entry.trips.filter { $0.id != inTrip }
    let state = shown ?? reactions
    HStack(alignment: .center, spacing: Space.m) {
      if !trips.isEmpty {
        FlowLayout(spacing: Space.s) {
          ForEach(trips, id: \.id) { trip in
            if linkTrips {
              NavigationLink(value: mine ? AppRouter.Route.trip(trip.id) : .publicTrip(trip.id)) { pill(trip.name) }
                .buttonStyle(.plain)
            } else {
              pill(trip.name)
            }
          }
        }
      }
      Spacer(minLength: 0)
      if let state { metrics(state) }
    }
    .padding(.horizontal, Space.l)
    .padding(.top, Space.s)
    .padding(.bottom, state == nil ? Space.l : Space.xs)
    if let likeError {
      Text(likeError)
        .font(.caption)
        .foregroundStyle(.red)
        .padding(.horizontal, Space.l)
        .padding(.bottom, Space.m)
    }
  }

  private func pill(_ name: String) -> some View {
    Label(name, systemImage: "suitcase")
      .font(.caption.weight(.medium))
      .foregroundStyle(.secondary)
      .padding(.horizontal, Space.m)
      .padding(.vertical, 6)
      .background(Color(.tertiarySystemFill), in: Capsule())
  }

  /// Heart and bubble badges with their counts. A like shows at once and
  /// writes in the background.
  private func metrics(_ state: Reactions) -> some View {
    HStack(spacing: Space.xs) {
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

      NavigationLink(value: AppRouter.Route.publicEntry(entry.id, comments: true)) {
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
    .padding(.horizontal, Space.s)
    .frame(minWidth: Space.touch, minHeight: Space.touch)
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

import SwiftUI

/// A public show, like the web's /e/:id: the post, its comments (#75), and
/// "More from @handle".
struct PublicEntryView: View {
  let id: UUID
  var showComments = false

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var state: Loadable<PublicPages.EntryPage?> = .loading

  var body: some View {
    ScrollViewReader { proxy in
    Screen(title: "", titleMode: .inline) {
      switch state {
      case .loading:
        LoadingText()
      case .failed(let message):
        EmptyState(title: "Couldn’t load this show", systemImage: "wifi.exclamationmark") { Text(message) }
      case .loaded(nil):
        EmptyState(title: "This show isn’t available", systemImage: "eye.slash") {
          Text("It may be private, or it may have been deleted.")
        }
      case .loaded(let page?):
        PostCard(
          entry: page.entry, owner: page.owner, photo: page.photo, mine: page.entry.userId == session.userId,
          linkTrips: !page.owner.isPrivate || page.entry.userId == session.userId, reactions: page.reactions)
        CommentThread(entryId: page.entry.id, ownerId: page.owner.id)
          .id("comments")
          .onAppear {
            // "Comment" and the likes link open at the thread, like #comments.
            if showComments { withAnimation { proxy.scrollTo("comments", anchor: .top) } }
          }
        NavigationLink(value: AppRouter.Route.profile(handle: page.owner.handle)) {
          HStack(spacing: Space.m) {
            Avatar(name: page.owner.name, url: page.owner.avatarURL, size: 32)
            Text("More from @\(page.owner.handle)").font(.body).foregroundStyle(.primary)
            Spacer(minLength: 0)
            RowChevron()
          }
          .padding(.horizontal, Space.l)
          .padding(.vertical, Space.m)
        }
        .pressableRow()
        .groupedCard()
      }
    }
    }
    .refreshable { await load() }
    .task(id: router.dataVersion) { await load() }
  }

  private func load() async {
    do {
      state = .loaded(try await PublicPages.entry(id))
    } catch {
      if state.value == nil { state = .failed("Check your connection and try again.") }
    }
  }
}

/// The comments under a public entry, oldest first, with who liked it
/// above them and a box to add one. The entry's owner can delete any
/// comment; others delete their own (Postgres enforces both).
struct CommentThread: View {
  let entryId: UUID
  let ownerId: UUID

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var comments: [Comment] = []
  @State private var likers: [Person] = []
  @State private var likes = 0
  @State private var draft = ""
  @State private var posting = false
  @State private var error: String?
  @State private var deleting: Comment?
  @FocusState private var typing: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: Space.l) {
      (Text("Comments").foregroundStyle(.primary)
        + Text(comments.isEmpty ? "" : " · \(comments.count)").foregroundStyle(.secondary))
        .font(.headline)
        .accessibilityAddTraits(.isHeader)
      if !likers.isEmpty { likedBy }
      if comments.isEmpty {
        Text("No comments yet. Say something nice.")
          .font(.subheadline)
          .foregroundStyle(.secondary)
      } else {
        ForEach(comments) { comment in row(comment) }
      }
      composer
    }
    .padding(Space.l)
    .frame(maxWidth: .infinity, alignment: .leading)
    .groupedCard()
    // `presenting` hands the comment to the button: the binding is cleared
    // before the button's action runs.
    .confirmationDialog(
      "Delete this comment?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
      titleVisibility: .visible, presenting: deleting
    ) { comment in
      Button("Delete", role: .destructive) { Task { await delete(comment) } }
    }
    .task(id: router.dataVersion) { await load() }
  }

  /// "Liked by @a, @b and 3 others"
  private var likedBy: some View {
    let others = likes - likers.count
    var text = Text("Liked by ").foregroundStyle(.secondary)
    for (i, person) in likers.enumerated() {
      if i > 0 {
        text = text + Text(i == likers.count - 1 && others <= 0 ? " and " : ", ").foregroundStyle(.secondary)
      }
      text = text + Text(verbatim: "@\(person.handle)").fontWeight(.semibold).foregroundStyle(.primary)
    }
    if others > 0 { text = text + Text(" and \(others) \(others == 1 ? "other" : "others")").foregroundStyle(.secondary) }
    return Label { text } icon: { Image(systemName: "heart.fill").foregroundStyle(Palette.tint) }
      .font(.subheadline)
  }

  private func row(_ comment: Comment) -> some View {
    let mine = comment.author.id == session.userId
    let canDelete = mine || ownerId == session.userId
    return HStack(alignment: .top, spacing: Space.m) {
      NavigationLink(value: AppRouter.Route.profile(handle: comment.author.handle)) {
        Avatar(name: comment.author.name, url: comment.author.avatarURL, size: 32)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("@\(comment.author.handle)’s profile")
      VStack(alignment: .leading, spacing: 2) {
        (Text(verbatim: "@\(comment.author.handle)").fontWeight(.semibold).foregroundStyle(.primary)
          + Text(" · \(Comment.timeAgo(comment.createdAt))").foregroundStyle(.secondary))
          .font(.footnote)
        Text(comment.body)
          .font(.body)
      }
      Spacer(minLength: 0)
      if canDelete {
        Button {
          deleting = comment
        } label: {
          Image(systemName: "trash")
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .frame(width: Space.touch, height: Space.touch)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(mine ? "Delete your comment" : "Delete comment by @\(comment.author.handle)")
      }
    }
    .accessibilityElement(children: .contain)
  }

  private var composer: some View {
    VStack(alignment: .trailing, spacing: Space.s) {
      TextField("Comment", text: $draft, prompt: Text("Add a comment…"), axis: .vertical)
        .lineLimit(1...5)
        .focused($typing)
        .padding(.horizontal, Space.l)
        .padding(.vertical, Space.m)
        .frame(minHeight: Space.touch)
        .background(Color(.tertiarySystemFill), in: .rect(cornerRadius: 20, style: .continuous))
        .onChange(of: draft) { _, value in
          if value.count > ReactionsAPI.commentMax { draft = String(value.prefix(ReactionsAPI.commentMax)) }
        }
      HStack {
        if let error {
          Text(error).font(.footnote).foregroundStyle(.red)
        } else if draft.count > ReactionsAPI.commentMax - 50 {
          Text("\(draft.count)/\(ReactionsAPI.commentMax)").font(.footnote).foregroundStyle(.secondary)
        }
        Spacer()
        Button(posting ? "Posting…" : "Post") { Task { await post() } }
          .buttonStyle(FollowButtonStyle(filled: true))
          .disabled(posting || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      }
    }
  }

  private func load() async {
    async let list = ReactionsAPI.comments(entryId)
    async let people = ReactionsAPI.likers(entryId)
    async let counts = ReactionsAPI.load([entryId])
    comments = (try? await list) ?? comments
    likers = await people
    likes = await counts[entryId]?.likes ?? 0
  }

  private func post() async {
    let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !body.isEmpty, let userId = session.userId else { return }
    posting = true
    defer { posting = false }
    error = nil
    do {
      try await ReactionsAPI.addComment(body, entryId: entryId, userId: userId)
      draft = ""
      typing = false
      router.dataChanged()
    } catch {
      self.error = "Couldn’t post your comment. Try again."
    }
  }

  private func delete(_ comment: Comment) async {
    do {
      try await ReactionsAPI.deleteComment(comment.id)
      router.dataChanged()
    } catch {
      self.error = "Couldn’t delete the comment. Try again."
    }
  }
}

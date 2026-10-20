import SwiftUI

/// A public show, like the web's /e/:id, as a grouped list: the post, who
/// liked it and its comments (#75), and "More from @handle". The comment box
/// is pinned to the bottom.
struct PublicEntryView: View {
  let id: UUID
  var showComments = false

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var state: Loadable<PublicPages.EntryPage?> = .loading

  var body: some View {
    ScrollViewReader { proxy in
      List {
        switch state {
        case .loading:
          PlaceholderRows(count: 3)
        case .failed(let message):
          EmptyState(title: "Couldn’t load this show", systemImage: "wifi.exclamationmark") { Text(message) }
            .listRowBackground(Color.clear)
        case .loaded(nil):
          EmptyState(title: "This show isn’t available", systemImage: "eye.slash") {
            Text("It may be private, or it may have been deleted.")
          }
          .listRowBackground(Color.clear)
        case .loaded(let page?):
          Section {
            PostCard(
              entry: page.entry, owner: page.owner, photo: page.photo, mine: page.entry.userId == session.userId,
              linkTrips: !page.owner.isPrivate || page.entry.userId == session.userId, reactions: page.reactions,
              opensShow: page.entry.userId == session.userId)
          }
          .listRowInsets(EdgeInsets())
          .listRowBackground(Color.clear)

          CommentThread(entryId: page.entry.id, ownerId: page.owner.id)
            .onAppear {
              // "Comment" and the likes link open at the thread, like #comments.
              if showComments { withAnimation { proxy.scrollTo("comments", anchor: .top) } }
            }

          Section {
            NavigationLink(value: AppRouter.Route.profile(handle: page.owner.handle)) {
              Label {
                Text("More from @\(page.owner.handle)")
              } icon: {
                Avatar(name: page.owner.name, url: page.owner.avatarURL, size: 28)
              }
            }
          }
        }
      }
      .listStyle(.insetGrouped)
      .tabBarClearance()
    }
    .navigationTitle(state.value??.entry.show.title ?? "")
    .navigationBarTitleDisplayMode(.inline)
    // The comment box stays at the bottom, above the tab bar.
    .safeAreaInset(edge: .bottom) {
      if case .loaded(let page?) = state { CommentComposer(entryId: page.entry.id) }
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

/// The comments under a public entry, oldest first, as a list section with
/// who liked it at the top; the box to add one is `CommentComposer`. Swipe
/// or long press a comment to delete it: the entry's owner can delete any
/// comment, others their own (Postgres enforces both).
struct CommentThread: View {
  let entryId: UUID
  let ownerId: UUID

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var comments: [Comment] = []
  @State private var likers: [Person] = []
  @State private var likes = 0
  @State private var error: String?
  @State private var deleting: Comment?

  var body: some View {
    Section {
      if !likers.isEmpty { likedBy }
      if comments.isEmpty {
        Text("No comments yet. Say something nice.")
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }
      ForEach(comments) { comment in row(comment) }
    } header: {
      Text(comments.isEmpty ? "Comments" : "Comments · \(comments.count)")
    } footer: {
      if let error { Text(error).foregroundStyle(.red) }
    }
    .id("comments")
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
    let deleteLabel = mine ? "Delete your comment" : "Delete comment by @\(comment.author.handle)"
    return HStack(alignment: .top, spacing: Space.m) {
      Avatar(name: comment.author.name, url: comment.author.avatarURL, size: 32)
      VStack(alignment: .leading, spacing: 2) {
        (Text(verbatim: "@\(comment.author.handle)").fontWeight(.semibold).foregroundStyle(.primary)
          + Text(" · \(Comment.timeAgo(comment.createdAt))").foregroundStyle(.secondary))
          .font(.footnote)
        Text(comment.body)
          .font(.body)
      }
    }
    .padding(.vertical, 2)
    .accessibilityElement(children: .combine)
    .swipeActions {
      if canDelete {
        // Not role: .destructive, which removes the row before the dialog can ask.
        Button("Delete", systemImage: "trash") { deleting = comment }
          .tint(.red)
          .accessibilityLabel(deleteLabel)
      }
    }
    .contextMenu {
      Button("View @\(comment.author.handle)", systemImage: "person.crop.circle") {
        router.open(.profile(handle: comment.author.handle))
      }
      if canDelete {
        Button(deleteLabel, systemImage: "trash", role: .destructive) { deleting = comment }
      }
    }
    // On the row itself: a dialog on the whole section doesn't present
    // reliably from a List.
    .confirmationDialog(
      "Delete this comment?",
      isPresented: Binding(get: { deleting?.id == comment.id }, set: { if !$0 { deleting = nil } }),
      titleVisibility: .visible
    ) {
      Button("Delete", role: .destructive) { Task { await delete(comment) } }
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

  private func delete(_ comment: Comment) async {
    do {
      try await ReactionsAPI.deleteComment(comment.id)
      error = nil
      router.dataChanged()
    } catch {
      self.error = "Couldn’t delete the comment. Try again."
    }
  }
}

/// The comment box, pinned above the tab bar: a growing field with the send
/// arrow inline on its right.
struct CommentComposer: View {
  let entryId: UUID

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var draft = ""
  @State private var posting = false
  @State private var error: String?
  @FocusState private var typing: Bool

  private var canPost: Bool { !posting && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

  var body: some View {
    VStack(alignment: .leading, spacing: Space.xs) {
      if let error {
        Text(error).font(.footnote).foregroundStyle(.red)
      } else if draft.count > ReactionsAPI.commentMax - 50 {
        Text("\(draft.count)/\(ReactionsAPI.commentMax)").font(.footnote).foregroundStyle(.secondary)
      }
      HStack(alignment: .bottom, spacing: Space.s) {
        TextField("Comment", text: $draft, prompt: Text("Add a comment…"), axis: .vertical)
          .lineLimit(1...5)
          .focused($typing)
          .onChange(of: draft) { _, value in
            if value.count > ReactionsAPI.commentMax { draft = String(value.prefix(ReactionsAPI.commentMax)) }
          }
        Button {
          Task { await post() }
        } label: {
          Image(systemName: "arrow.up.circle.fill")
            .font(.title2)
            .foregroundStyle(canPost ? AnyShapeStyle(Palette.tint) : AnyShapeStyle(.tertiary))
        }
        .buttonStyle(.plain)
        .disabled(!canPost)
        .accessibilityLabel(posting ? "Posting" : "Post")
      }
      .padding(.leading, Space.l)
      .padding(.trailing, Space.xs)
      .padding(.vertical, 6)
      .frame(minHeight: Space.touch)
      .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 22, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Color.primary.opacity(0.06), lineWidth: 1))
    }
    .padding(.horizontal, Space.l)
    .padding(.vertical, Space.s)
    .background(.bar)
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
}

import Supabase
import SwiftUI

/// Follow / Requested / Following, like the web's. Postgres decides whether
/// a follow is accepted at once or waits for approval (private profiles).
/// On your own profile it's "Edit profile".
struct FollowButton: View {
  let person: Person
  @State private var viewer: Viewer

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var busy = false
  @State private var confirmUnfollow = false
  @State private var failed = false

  init(person: Person, viewer: Viewer) {
    self.person = person
    _viewer = State(initialValue: viewer)
  }

  init(profile: Profile, viewer: Viewer) {
    self.init(person: profile.person, viewer: viewer)
  }

  var body: some View {
    Group {
      if viewer.isOwner {
        // A button through the router, not a NavigationLink: in a List row a
        // NavigationLink gets a chevron and takes over the row's taps.
        Button("Edit profile") { router.open(.settings) }
          .buttonStyle(.bordered)
      } else {
        let status = viewer.status
        let title = status == .accepted ? "Following" : status == .pending ? "Requested" : "Follow"
        let action = {
          if status == .accepted, person.isPrivate { confirmUnfollow = true } else { Task { await toggle() } }
        }
        // Follow is the one prominent action; once you follow or have asked, it steps back.
        if status == .none {
          Button(title, action: action).buttonStyle(.borderedProminent).fixedSize()
        } else {
          Button(title, action: action).buttonStyle(.bordered).fixedSize()
        }
      }
    }
    .controlSize(.small)
    .disabled(busy)
    .modifier(Hint(status: viewer.isOwner ? nil : viewer.status, handle: person.handle))
    .confirmationDialog(
      "Unfollow @\(person.handle)?", isPresented: $confirmUnfollow, titleVisibility: .visible
    ) {
      Button("Unfollow", role: .destructive) { Task { await toggle() } }
    } message: {
      Text("You’ll need to ask again to see their shows.")
    }
    .alert("Couldn’t update. Try again.", isPresented: $failed) { Button("OK", role: .cancel) {} }
  }

  private func toggle() async {
    guard let me = session.userId else { return }
    busy = true
    defer { busy = false }
    do {
      if viewer.status == .none {
        try await Follows.follow(person.id, me: me)
      } else {
        try await Follows.unfollow(person.id, me: me)
      }
      viewer = await PublicPages.viewer(of: person.id, me: me)
      router.dataChanged()
    } catch {
      failed = true
    }
  }
}

private struct Hint: ViewModifier {
  let status: Viewer.Status?
  let handle: String

  func body(content: Content) -> some View {
    content.accessibilityHint(
      status == .accepted ? "Unfollow @\(handle)" : status == .pending ? "Cancel the follow request" : "")
  }
}

/// A profile's followers or following, like the web's /@handle/followers.
/// On your own followers you can remove someone.
struct FollowsListView: View {
  let handle: String
  let list: AppRouter.FollowList

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var state: Loadable<Model> = .loading
  @State private var removing: Person?

  struct Model {
    let profile: Profile
    let visible: Bool
    let people: [Person]
    let viewers: [UUID: Viewer]
  }

  private var title: String { list == .followers ? "Followers" : "Following" }

  var body: some View {
    List {
      switch state {
      case .loading:
        PlaceholderRows()
      case .failed(let message):
        EmptyState(title: "Couldn’t load this list", systemImage: "wifi.exclamationmark") { Text(message) }
          .listRowBackground(Color.clear)
      case .loaded(let m) where !m.visible:
        EmptyState(title: "This profile is private", systemImage: "lock") {
          Text("Follow @\(m.profile.handle) to see who they follow and who follows them.")
        }
        .listRowBackground(Color.clear)
      case .loaded(let m) where m.people.isEmpty:
        EmptyState(title: list == .followers ? "No followers yet" : "Not following anyone yet", systemImage: "person.2") {
          Text(list == .followers ? "People who follow @\(m.profile.handle) appear here." : "People @\(m.profile.handle) follows appear here.")
        }
        .listRowBackground(Color.clear)
      case .loaded(let m):
        let mine = list == .followers && m.profile.id == session.userId
        Section {
          ForEach(m.people) { person in
            PersonRow(person: person) {
              if mine {
                Button("Remove") { removing = person }
                  .buttonStyle(.bordered)
                  .controlSize(.small)
                  .accessibilityLabel("Remove @\(person.handle)")
              } else if person.id != session.userId {
                FollowButton(person: person, viewer: m.viewers[person.id] ?? Viewer(isOwner: false, status: .none))
              }
            }
            .swipeActions {
              if mine { Button("Remove") { removing = person }.tint(.red) }
            }
          }
        }
      }
    }
    .listStyle(.insetGrouped)
    .navigationTitle(title)
    .navigationBarTitleDisplayMode(.inline)
    .confirmationDialog(
      "Remove @\(removing?.handle ?? "")?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
      titleVisibility: .visible, presenting: removing
    ) { person in
      Button("Remove", role: .destructive) { Task { await remove(person) } }
    } message: { _ in
      Text("They won’t be told. They can follow you again\(state.value?.profile.isPrivate == true ? " if you approve it" : "").")
    }
    .refreshable { await load() }
    .task(id: router.dataVersion) { await load() }
  }

  private func load() async {
    guard let me = session.userId else { return }
    do {
      let rows: [Profile] = try await supabase.from("profiles").select(Profile.select).eq("handle", value: handle).limit(1)
        .execute().value
      guard let profile = rows.first else { return state = .failed("There’s no profile at @\(handle).") }
      let visible = await Follows.isVisible(profile.id)
      let people = visible ? try await Follows.list(profile.id, list) : []
      var viewers: [UUID: Viewer] = [:]
      for person in people where person.id != me { viewers[person.id] = await PublicPages.viewer(of: person.id, me: me) }
      state = .loaded(Model(profile: profile, visible: visible, people: people, viewers: viewers))
    } catch {
      if state.value == nil { state = .failed("Check your connection and try again.") }
    }
  }

  private func remove(_ person: Person) async {
    guard let me = session.userId else { return }
    try? await Follows.remove(follower: person.id, me: me)
    router.dataChanged()
  }
}

/// Follow requests waiting for you, as rows for a Profile list section:
/// approve or decline, with the same as swipe actions.
struct FollowRequests: View {
  let people: [Person]

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var busy: UUID?

  var body: some View {
    ForEach(people) { person in
      PersonRow(person: person) {
        HStack(spacing: Space.s) {
          Button("Approve") { Task { await answer(person, approve: true) } }
            .buttonStyle(.borderedProminent)
            .fixedSize()
            .accessibilityLabel("Approve @\(person.handle)")
          Button("Decline", systemImage: "xmark") { Task { await answer(person, approve: false) } }
            .labelStyle(.iconOnly)
            .buttonStyle(.bordered)
            .buttonBorderShape(.circle)
            .accessibilityLabel("Decline @\(person.handle)")
        }
        .controlSize(.small)
        .disabled(busy == person.id)
      }
      .swipeActions {
        Button("Decline", role: .destructive) { Task { await answer(person, approve: false) } }
        Button("Approve") { Task { await answer(person, approve: true) } }.tint(.green)
      }
    }
  }

  private func answer(_ person: Person, approve: Bool) async {
    guard let me = session.userId else { return }
    busy = person.id
    defer { busy = nil }
    do {
      if approve { try await Follows.approve(person.id, me: me) } else { try await Follows.remove(follower: person.id, me: me) }
    } catch {
      Log.data.error("Answering a follow request failed: \(error.localizedDescription, privacy: .public)")
    }
    router.dataChanged()
  }
}

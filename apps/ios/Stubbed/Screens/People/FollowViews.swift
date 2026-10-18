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
        NavigationLink("Edit profile", value: AppRouter.Route.settings)
          .buttonStyle(.tintedPill)
      } else {
        let status = viewer.status
        Button(status == .accepted ? "Following" : status == .pending ? "Requested" : "Follow") {
          if status == .accepted, person.isPrivate { confirmUnfollow = true } else { Task { await toggle() } }
        }
        .buttonStyle(FollowButtonStyle(filled: status == .none))
        .disabled(busy)
        .accessibilityHint(
          status == .accepted ? "Unfollow @\(person.handle)" : status == .pending ? "Cancel the follow request" : "")
      }
    }
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

/// The tint capsule for Follow, a system fill once you follow or have asked.
struct FollowButtonStyle: ButtonStyle {
  let filled: Bool

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .lineLimit(1)
      .fixedSize()
      .font(.subheadline.weight(.semibold))
      .foregroundStyle(filled ? Palette.onTint : Color.primary)
      .padding(.horizontal, Space.l)
      .frame(minHeight: 34)
      .background(
        filled ? (configuration.isPressed ? Palette.tintPressed : Palette.tint)
          : configuration.isPressed ? Color(.systemFill) : Color(.tertiarySystemFill),
        in: .capsule)
      .frame(minHeight: Space.touch)
      .contentShape(.rect)
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
    Screen(title: title) {
      switch state {
      case .loading:
        LoadingText()
      case .failed(let message):
        EmptyState(title: "Couldn’t load this list", systemImage: "wifi.exclamationmark") { Text(message) }
      case .loaded(let m) where !m.visible:
        EmptyState(title: "This profile is private", systemImage: "lock") {
          Text("Follow @\(m.profile.handle) to see who they follow and who follows them.")
        }
      case .loaded(let m) where m.people.isEmpty:
        EmptyState(title: list == .followers ? "No followers yet" : "Not following anyone yet", systemImage: "person.2") {
          Text(list == .followers ? "People who follow @\(m.profile.handle) appear here." : "People @\(m.profile.handle) follows appear here.")
        }
      case .loaded(let m):
        VStack(spacing: 0) {
          ForEach(Array(m.people.enumerated()), id: \.element.id) { index, person in
            if index > 0 { Divider().padding(.leading, 72) }
            PersonRow(person: person) {
              if list == .followers, m.profile.id == session.userId {
                Button("Remove") { removing = person }
                  .buttonStyle(FollowButtonStyle(filled: false))
                  .accessibilityLabel("Remove @\(person.handle)")
              } else if person.id != session.userId {
                FollowButton(person: person, viewer: m.viewers[person.id] ?? Viewer(isOwner: false, status: .none))
              }
            }
          }
        }
        .groupedCard()
      }
    }
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

/// Follow requests waiting for you, on the Profile tab: approve or decline.
struct FollowRequests: View {
  let people: [Person]

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var busy: UUID?

  var body: some View {
    VStack(alignment: .leading, spacing: Space.m) {
      Text(people.count == 1 ? "1 follow request" : "\(people.count) follow requests")
        .font(.title3.bold())
        .accessibilityAddTraits(.isHeader)
      VStack(spacing: 0) {
        ForEach(Array(people.enumerated()), id: \.element.id) { index, person in
          if index > 0 { Divider().padding(.leading, 72) }
          PersonRow(person: person) {
            HStack(spacing: Space.s) {
              Button("Approve") { Task { await answer(person, approve: true) } }
                .buttonStyle(FollowButtonStyle(filled: true))
                .accessibilityLabel("Approve @\(person.handle)")
              Button("Decline", systemImage: "xmark") { Task { await answer(person, approve: false) } }
                .labelStyle(.iconOnly)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(width: 34, height: 34)
                .background(Color(.tertiarySystemFill), in: .circle)
                .frame(width: Space.touch, height: Space.touch)
                .buttonStyle(.borderless)
                .accessibilityLabel("Decline @\(person.handle)")
            }
            .disabled(busy == person.id)
          }
        }
      }
      .groupedCard()
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

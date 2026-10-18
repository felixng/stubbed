import SwiftUI

/// Find people to follow (`search_profiles`); their public shows then
/// appear in your feed.
struct PeopleView: View {
  @Environment(AppSession.self) private var session
  @State private var query = ""
  @State private var results: [Person] = []
  @State private var viewers: [UUID: Viewer] = [:]
  @State private var searched = false

  var body: some View {
    Screen(title: "Find people") {
      let q = query.trimmingCharacters(in: .whitespaces)
      if q.count >= 2, searched, results.isEmpty {
        ContentUnavailableView.search(text: q)
      } else if results.isEmpty {
        EmptyState(title: "Find people", systemImage: "person.2") {
          Text("Follow people to see the shows they track in your feed. Search by name or handle.")
        }
      } else {
        VStack(spacing: 0) {
          ForEach(Array(results.enumerated()), id: \.element.id) { index, person in
            if index > 0 { Divider().padding(.leading, 72) }
            PersonRow(person: person) {
              if person.id != session.userId {
                FollowButton(person: person, viewer: viewers[person.id] ?? Viewer(isOwner: false, status: .none))
              }
            }
          }
        }
        .groupedCard()
      }
    }
    .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search by name or @handle")
    .textInputAutocapitalization(.never)
    .autocorrectionDisabled()
    .task(id: query) { await search() }
  }

  private func search() async {
    let q = query.trimmingCharacters(in: .whitespaces)
    guard q.count >= 2 else {
      results = []
      searched = false
      return
    }
    try? await Task.sleep(for: .milliseconds(200))
    guard !Task.isCancelled, let me = session.userId, let found = try? await PublicPages.search(q) else { return }
    var status: [UUID: Viewer] = [:]
    for person in found where person.id != me {
      status[person.id] = await PublicPages.viewer(of: person.id, me: me)
    }
    guard !Task.isCancelled else { return }
    results = found
    viewers = status
    searched = true
  }
}

/// A person in a list: avatar, @handle and name, opening their profile,
/// with a trailing control (Follow, Remove, Approve…).
struct PersonRow<Trailing: View>: View {
  let person: Person
  @ViewBuilder var trailing: Trailing

  var body: some View {
    HStack(spacing: Space.m) {
      NavigationLink(value: AppRouter.Route.profile(handle: person.handle)) {
        HStack(spacing: Space.m) {
          Avatar(name: person.name, url: person.avatarURL, size: 44)
          VStack(alignment: .leading, spacing: 0) {
            Text(verbatim: "@\(person.handle)")
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(.primary)
              .lineLimit(1)
            if let name = person.displayName, !name.isEmpty {
              Text(name).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
            }
          }
          Spacer(minLength: 0)
        }
        .padding(.leading, Space.l)
        .padding(.vertical, Space.m)
        .contentShape(.rect)
      }
      .pressableRow()
      trailing
        .padding(.trailing, Space.l)
    }
  }
}

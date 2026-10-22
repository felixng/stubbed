import SwiftUI

/// People matching a search (`search_profiles`), with Follow on each, as
/// a list. Shown on Home while its search field is in use; their public
/// shows then appear in your feed.
struct PeopleResults: View {
  let query: String

  @Environment(AppSession.self) private var session
  @State private var results: [Person] = []
  @State private var viewers: [UUID: Viewer] = [:]
  @State private var searched = false

  var body: some View {
    List {
      let q = query.trimmingCharacters(in: .whitespaces)
      if q.count >= 2, searched, results.isEmpty {
        ContentUnavailableView.search(text: q)
          .listRowBackground(Color.clear)
      } else if q.count < 2 {
        Section {
        } footer: {
          Text("Search by name or @handle. Follow people you go to the theatre with and their shows appear in your feed.")
        }
      } else {
        Section {
          ForEach(results) { person in
            PersonRow(person: person) {
              if person.id != session.userId {
                FollowButton(person: person, viewer: viewers[person.id] ?? Viewer(isOwner: false, status: .none))
              }
            }
          }
        }
      }
    }
    .listStyle(.insetGrouped)
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

/// A person as a list row: avatar, @handle and name, opening their
/// profile (the system chevron), with a trailing control (Follow, Remove,
/// Approve…) that takes its own taps.
struct PersonRow<Trailing: View>: View {
  let person: Person
  @ViewBuilder var trailing: Trailing

  var body: some View {
    NavigationLink(value: AppRouter.Route.profile(handle: person.handle)) {
      HStack(spacing: Space.m) {
        Avatar(name: person.name, url: person.avatarURL, size: 40)
        VStack(alignment: .leading, spacing: 0) {
          Text(verbatim: "@\(person.handle)")
            .font(.subheadline.weight(.semibold))
            .lineLimit(1)
          if let name = person.displayName, !name.isEmpty {
            Text(name).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
          }
        }
        Spacer(minLength: 0)
        trailing
      }
    }
  }
}

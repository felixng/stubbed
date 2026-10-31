import SwiftUI

struct NotificationsView: View {
  @Environment(AppRouter.self) private var router
  @State private var items: [NotificationItem] = []
  @State private var loaded = false
  @State private var failed = false
  @State private var busy = false
  @State private var more = false

  var body: some View {
    List {
      if !loaded && !failed { PlaceholderRows() }
      if failed {
        Section {
          Text("Couldn’t update notifications. Check your connection.").foregroundStyle(.secondary)
          Button("Try again") { Task { await load() } }
        }
      }
      if loaded && items.isEmpty && !failed {
        ContentUnavailableView("You’re all caught up", systemImage: "bell", description: Text("Likes, comments and follow activity will appear here."))
      }
      ForEach(["Today", "Yesterday", "This week", "Earlier"], id: \.self) { group in
        let rows = items.filter { $0.group == group }
        if !rows.isEmpty {
          Section(group) {
            ForEach(rows) { item in
              Button { Task { await open(item) } } label: {
                HStack(alignment: .top, spacing: Space.m) {
                  Avatar(name: item.display_name ?? item.handle, url: item.avatar_url.flatMap(URL.init(string:)), size: 40)
                  VStack(alignment: .leading, spacing: Space.xs) {
                    Text(item.text).font(.body.weight(item.unread ? .semibold : .regular)).foregroundStyle(Color.primary)
                    Label { Text(item.updated_at, style: .relative) } icon: { Image(systemName: item.category.symbol) }
                      .font(.caption).foregroundStyle(.secondary)
                  }
                  Spacer(minLength: 0)
                  if item.unread { Image(systemName: "circle.fill").font(.caption2).foregroundStyle(Palette.tintText).accessibilityLabel("Unread") }
                  Image(systemName: "chevron.right").font(.footnote).foregroundStyle(.tertiary)
                }
              }.buttonStyle(.plain).disabled(busy)
            }
          }
        }
      }
      if more { Button("Load older activity") { Task { await loadMore() } }.disabled(busy) }
    }
    .listStyle(.insetGrouped)
    .tabBarClearance()
    .navigationTitle("Notifications")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Menu {
          Button("Mark all as read") { Task { await readAll() } }.disabled(busy || !items.contains { $0.unread })
          NavigationLink("Notification settings", value: AppRouter.Route.notificationSettings)
        } label: { Image(systemName: "ellipsis.circle") }.accessibilityLabel("Notification actions")
      }
    }
    .refreshable { await load() }
    .task(id: router.dataVersion) { await load() }
    .task {
      while !Task.isCancelled {
        do { try await Task.sleep(for: .seconds(30)) } catch { return }
        await load()
      }
    }
  }
  private func load() async {
    do { items = try await Notifications.page(); more = items.count == 30; loaded = true; failed = false }
    catch { failed = true }
  }
  private func loadMore() async {
    guard let last = items.last else { return }
    busy = true; defer { busy = false }
    do {
      let next = try await Notifications.page(before: last)
      let seen = Set(items.map(\.id)); items += next.filter { !seen.contains($0.id) }
      more = next.count == 30; failed = false
    } catch { failed = true }
  }
  private func open(_ item: NotificationItem) async {
    busy = true; defer { busy = false }
    do { try await Notifications.read(item); router.dataChanged(); router.open(item.route) }
    catch { failed = true }
  }
  private func readAll() async {
    busy = true; defer { busy = false }
    do { try await Notifications.readAll(); await load(); router.dataChanged() }
    catch { failed = true }
  }
}

struct NotificationSettingsView: View {
  var body: some View {
    Form { NativePushSettings(); NotificationCategorySection(channel: "inbox") }
      .navigationTitle("Notification settings")
      .navigationBarTitleDisplayMode(.inline)
      .tabBarClearance()
  }
}

struct NotificationCategorySection: View {
  let channel: String
  @State private var choices: [NotificationChoice] = []
  @State private var loaded = false
  @State private var failed = false
  @State private var busy = false
  var body: some View {
    Section {
      if !loaded && !failed { ProgressView("Loading preferences…") }
      ForEach(choices, id: \.category) { choice in
        Toggle(choice.category.label, isOn: Binding(get: { channel == "inbox" ? choice.inbox : choice.push }, set: { value in Task { await save(choice.category, value) } })).disabled(busy)
      }
      if failed { Text("Couldn’t update preferences. Your previous choices are unchanged.").foregroundStyle(.red); Button("Try again") { Task { await load() } } }
    } header: { Text(channel == "inbox" ? "In-app" : "Push categories") }
      footer: { Text(channel == "inbox" ? "Choose what appears in your shared inbox. Existing history stays." : "Your choices stay saved when push is switched off.") }
      .task { await load() }
  }
  private func load() async {
    do { choices = try await Notifications.choices(); loaded = true; failed = false } catch { failed = true }
  }
  private func save(_ category: NotificationCategory, _ value: Bool) async {
    busy = true; defer { busy = false }
    do {
      try await Notifications.set(category, channel: channel, enabled: value)
      if let index = choices.firstIndex(where: { $0.category == category }) {
        if channel == "inbox" { choices[index].inbox = value } else { choices[index].push = value }
      }
      failed = false
    } catch { failed = true }
  }
}

struct NotificationRequestsView: View {
  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var people: [Person] = []
  @State private var loaded = false
  @State private var failed = false
  var body: some View {
    List {
      if !loaded && !failed { PlaceholderRows() }
      FollowRequests(people: people)
      if loaded && people.isEmpty { Text("No pending follow requests.").foregroundStyle(.secondary) }
      if failed { Text("Couldn’t load requests."); Button("Try again") { Task { await load() } } }
    }.navigationTitle("Follow requests").navigationBarTitleDisplayMode(.inline)
      .task(id: router.dataVersion) { await load() }.refreshable { await load() }
  }
  private func load() async {
    guard let me = session.userId else { return }
    do { people = try await Follows.requests(me); loaded = true; failed = false } catch { failed = true }
  }
}

import SwiftUI

/// Home: the feed. Your shows and the shows of people you follow, newest
/// first, a page at a time. The search button in the bar finds people to
/// follow. Your diary lives on the Profile tab.
struct HomeView: View {
  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router

  @State private var items: [FeedItem] = []
  @State private var next: Feed.Cursor?
  @State private var searching = false
  @State private var state = LoadState.loading
  @State private var loadingMore = false
  @State private var moreFailed = false

  enum LoadState { case loading, loaded, failed }

  var body: some View {
    content
      .navigationTitle("Home")
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Search people", systemImage: "magnifyingglass") { searching = true }
        }
      }
      .sheet(isPresented: $searching) { PeopleSearchSheet() }
      // Logging a show starts the feed over from the top.
      .task(id: router.dataVersion) { await load() }
  }

  @ViewBuilder private var content: some View {
    Group {
      switch state {
      case .loading:
        // The feed's shape in grey while the first page loads.
        Screen(title: "Home") {
          ForEach(0..<3, id: \.self) { _ in
            VStack(alignment: .leading, spacing: Space.m) {
              Text(verbatim: "@placeholder · date").font(.subheadline)
              HStack(alignment: .top, spacing: Space.m) {
                RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).fill(Color(.systemFill)).frame(width: 48, height: 64)
                VStack(alignment: .leading, spacing: 4) {
                  Text(verbatim: "Placeholder show title").font(.headline)
                  Text(verbatim: "Placeholder theatre, city").font(.subheadline)
                }
              }
            }
            .padding(Space.l)
            .frame(maxWidth: .infinity, alignment: .leading)
            .groupedCard()
          }
          .redacted(reason: .placeholder)
          .accessibilityHidden(true)
        }
      case .failed:
        ContentUnavailableView {
          Label("Couldn’t load your feed", systemImage: "wifi.exclamationmark")
        } description: {
          Text("Check your connection and try again.")
        } actions: {
          Button("Try again") { Task { await load() } }
            .buttonStyle(.bordered)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Home")
      case .loaded:
        feed
      }
    }
  }

  private var feed: some View {
    Screen(title: "Home") {
      if items.isEmpty {
        ContentUnavailableView {
          Label("Nothing here yet", systemImage: "theatermasks")
        } description: {
          Text("Shows you track appear here, along with shows from people you follow. Find them with the search button.")
        } actions: {
          Button("Track a show") { router.startLog() }
            .buttonStyle(.borderedProminent)
        }
        .padding(.vertical, Space.xxl)
      } else {
        LazyVStack(spacing: Space.l) {
          ForEach(items) { item in
            PostCard(
              entry: item.entry, owner: item.owner, photo: item.photo, mine: item.mine,
              // A private profile's trip pages don't open for others.
              linkTrips: item.mine || !item.owner.isPrivate, reactions: item.reactions)
          }
          if next != nil { pageEnd }
        }
      }
    }
    .refreshable { await load() }
  }

  /// Loads the next page as the end comes into view.
  private var pageEnd: some View {
    Group {
      if moreFailed {
        Button("Couldn’t load more. Try again") { Task { await loadMore() } }
          .font(.subheadline.weight(.semibold))
      } else {
        ProgressView().onAppear { Task { await loadMore() } }
      }
    }
    .frame(maxWidth: .infinity, minHeight: Space.touch)
  }

  private func load() async {
    guard let userId = session.userId else { return }
    async let page = Feed.page(after: nil, userId: userId)
    do {
      let first = try await page
      items = first.items
      next = first.next
      moreFailed = false
      state = .loaded
    } catch {
      if items.isEmpty { state = .failed }
    }
  }

  private func loadMore() async {
    guard let userId = session.userId, let cursor = next, !loadingMore else { return }
    loadingMore = true
    defer { loadingMore = false }
    do {
      let page = try await Feed.page(after: cursor, userId: userId)
      let seen = Set(items.map(\.id))
      items += page.items.filter { !seen.contains($0.id) }
      next = page.next
      moreFailed = false
    } catch {
      moreFailed = true
    }
  }
}

/// Search people, opened from Home's search button: a sheet with the field
/// focused and the keyboard up, results with Follow as you type, and Done in
/// the bar. Opening a profile closes the sheet and shows it on Home.
private struct PeopleSearchSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(AppRouter.self) private var router
  @State private var query = ""
  @State private var active = true

  var body: some View {
    NavigationStack {
      PeopleResults(query: query) { person in
        dismiss()
        router.open(.profile(handle: person.handle))
      }
        .navigationTitle("Search people")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(
          text: $query, isPresented: $active, placement: .navigationBarDrawer(displayMode: .always),
          prompt: "Name or @handle")
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .toolbar {
          ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
        }
    }
  }
}

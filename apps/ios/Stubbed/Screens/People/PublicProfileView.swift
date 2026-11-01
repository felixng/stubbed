import SwiftUI

/// Someone's profile as everyone sees it (yours too, from "View public
/// profile"): compact identity and counts, a public-only year summary,
/// then their public shows. A private profile shows just its header unless
/// you're an approved follower.
struct PublicProfileView: View {
  let handle: String

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var state: Loadable<PublicPages.ProfilePage?> = .loading
  @State private var reporting = false
  @State private var selectedDay: PublicProfileDay?
  @State private var confirmBlock = false
  @State private var blockError = false

  var body: some View {
    Group {
      List {
        switch state {
        case .loading:
          PlaceholderRows(count: 3)
        case .failed(let message):
          EmptyState(title: "Couldn’t load this profile", systemImage: "wifi.exclamationmark") { Text(message) }
            .listRowBackground(Color.clear)
        case .loaded(nil):
          EmptyState(title: "No one here", systemImage: "person.crop.circle.badge.questionmark") {
            Text("There’s no profile at @\(handle).")
          }
          .listRowBackground(Color.clear)
        case .loaded(let page?):
          Section {
            header(page)
            HStack(alignment: .top, spacing: Space.s) {
              count(page.stats?.shows, "Shows")
              Button { router.open(.follows(handle: page.profile.handle, list: .followers)) } label: {
                count(page.follows.followers, "Followers")
              }
              Button { router.open(.follows(handle: page.profile.handle, list: .following)) } label: {
                count(page.follows.following, "Following")
              }
            }
            .buttonStyle(.borderless)
            .foregroundStyle(.primary)
            .padding(.vertical, Space.xs)
          }
          if page.stats != nil {
            Section {
              if let activity = page.yearActivity {
                VStack(alignment: .leading, spacing: Space.l) {
                  ProfileYearMetrics(shows: activity.total, weekly: activity.current_weekly, best: activity.longest_weekly)
                  ActivityHeatmap(year: InsightStats.currentYear, counts: activity.counts) { day in
                    selectedDay = PublicProfileDay(profile: page.profile, date: day)
                  }
                }
                .padding(.vertical, Space.s)
              } else {
                Text("Year summary couldn’t load.").foregroundStyle(.secondary)
                Button("Try again") { Task { await load() } }
              }
            } header: {
              ProfileYearHeading(year: InsightStats.currentYear)
                .accessibilityIdentifier("public-profile-year-header")
            }
          }
          if page.viewer.blocked {
            EmptyState(title: "You’ve blocked @\(page.profile.handle)", systemImage: "hand.raised") {
              Text("You don’t see each other’s shows, and they can’t follow you, like or comment.")
              Button("Unblock") { Task { await setBlocked(false, page.profile.id) } }
                .buttonStyle(.bordered)
                .padding(.top, Space.s)
            }
            .listRowBackground(Color.clear)
          } else if page.stats == nil {
            EmptyState(title: "This profile is private", systemImage: "lock") { Text(privateMessage(page)) }
              .listRowBackground(Color.clear)
          } else if page.entries.isEmpty {
            EmptyState(title: "No public shows yet", systemImage: "theatermasks") {
              Text("When @\(page.profile.handle) logs a public show, it’ll appear here.")
            }
            .listRowBackground(Color.clear)
          } else {
            Section("Recent shows") {
              ForEach(page.entries) { entry in
                PostCard(
                  entry: entry, owner: page.profile.person, photo: entry.photoPath.flatMap { page.photos[$0] },
                  mine: page.viewer.isOwner, reactions: page.reactions[entry.id] ?? Reactions()
                )
                .padding(.bottom, Space.l)
                .id(entry.id)
              }
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
          }
        }
      }
      .listStyle(.insetGrouped)
      .tabBarClearance()
    }
    .navigationTitle("@\(handle)")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      if case .loaded(let page?) = state, !page.viewer.isOwner {
        ToolbarItem(placement: .primaryAction) {
          Menu {
            Button("Report", systemImage: "flag") { reporting = true }
            if page.viewer.blocked {
              Button("Unblock", systemImage: "hand.raised.slash") { Task { await setBlocked(false, page.profile.id) } }
            } else {
              Button("Block", systemImage: "hand.raised", role: .destructive) { confirmBlock = true }
            }
          } label: {
            Label("More", systemImage: "ellipsis.circle")
          }
        }
      }
    }
    .sheet(item: $selectedDay) { selection in
      PublicProfileDayView(selection: selection)
    }
    .sheet(isPresented: $reporting) {
      if case .loaded(let page?) = state {
        ReportSheet(target: .profile(page.profile.id), owner: page.viewer.blocked ? nil : page.profile.person)
      }
    }
    .confirmationDialog("Block @\(handle)?", isPresented: $confirmBlock, titleVisibility: .visible) {
      Button("Block", role: .destructive) {
        if case .loaded(let page?) = state { Task { await setBlocked(true, page.profile.id) } }
      }
    } message: {
      Text("They won’t see your shows or find you, and they can’t follow you, like or comment. Any follows between you end. They aren’t told.")
    }
    .alert("Couldn’t update. Try again.", isPresented: $blockError) { Button("OK", role: .cancel) {} }
    .refreshable { await load() }
    .task(id: router.dataVersion) { await load() }
  }

  private func setBlocked(_ blocked: Bool, _ id: UUID) async {
    do {
      if blocked { try await Blocks.block(id) } else { try await Blocks.unblock(id) }
      router.dataChanged()
    } catch {
      blockError = true
    }
  }

  private func header(_ page: PublicPages.ProfilePage) -> some View {
    let p = page.profile
    return VStack(alignment: .leading, spacing: Space.m) {
      HStack(spacing: Space.l) {
        Avatar(name: p.name, url: p.avatarURL, size: 64)
          .padding(2.5)
          .background(Color(.secondarySystemGroupedBackground), in: .circle)
          .padding(2.5)
          .background(Palette.sweep, in: .circle)
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: "@\(p.handle)").font(.title2.bold())
            .accessibilityAddTraits(.isHeader)
          if let name = p.displayName, !name.isEmpty {
            Text(name).font(.subheadline).foregroundStyle(.secondary)
          }
          if p.isPrivate {
            Label("Private profile", systemImage: "lock.fill").font(.footnote).foregroundStyle(.secondary)
          }
        }
      }
      if let bio = p.bio, !bio.isEmpty { Text(bio).font(.body) }
      if let link = p.link, let url = URL(string: link) {
        Link(destination: url) {
          Label(Self.displayLink(link), systemImage: "link")
            .font(.subheadline.weight(.semibold))
            .lineLimit(1)
        }
        .buttonStyle(.borderless)
      }
      if !page.viewer.blocked { FollowButton(profile: p, viewer: page.viewer) }
    }
    .padding(.vertical, Space.xs)
  }

  private func count(_ value: Int?, _ label: String) -> some View {
    VStack(spacing: Space.xs) {
      Text(value?.formatted() ?? "—").font(.title3.bold()).monospacedDigit()
      Text(label).font(.footnote).foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, minHeight: Space.touch)
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(label), \(value.map { $0.formatted() } ?? "not available")")
  }

  private func privateMessage(_ page: PublicPages.ProfilePage) -> String {
    if page.viewer.isOwner { return "Only people you approve see your shows. This is what everyone else sees." }
    if page.viewer.status == .pending {
      return "Your request is with @\(page.profile.handle). Their shows appear here once they approve it."
    }
    return "Follow @\(page.profile.handle) to see their shows. They approve each follower."
  }

  /// "https://www.instagram.com/you/" → "instagram.com/you"
  static func displayLink(_ link: String) -> String {
    link.replacingOccurrences(of: "^https?://(www\\.)?", with: "", options: .regularExpression)
      .replacingOccurrences(of: "/$", with: "", options: .regularExpression)
  }

  private func load() async {
    guard let me = session.userId else { return }
    do {
      state = .loaded(try await PublicPages.profile(handle: handle, me: me))
    } catch {
      if state.value == nil { state = .failed("Check your connection and try again.") }
    }
  }
}

extension Profile {
  var person: Person {
    Person(id: id, handle: handle, displayName: displayName, avatarURL: avatarURL, isPrivate: isPrivate)
  }
}

extension Person {
  init(id: UUID, handle: String, displayName: String?, avatarURL: URL?, isPrivate: Bool) {
    self.id = id
    self.handle = handle
    self.displayName = displayName
    self.avatarURL = avatarURL
    self.isPrivate = isPrivate
  }
}

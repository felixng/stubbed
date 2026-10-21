import SwiftUI

/// Someone's profile as everyone sees it (yours too, from "View public
/// profile"), like the web's /@handle: photos from their shows, avatar,
/// handle, name, bio, link, follow counts, stats, then the calendar and
/// their public shows. A private profile shows just its header unless
/// you're an approved follower.
struct PublicProfileView: View {
  let handle: String

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var state: Loadable<PublicPages.ProfilePage?> = .loading

  var body: some View {
    ScrollViewReader { proxy in
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
          Section { header(page) }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
          if let stats = page.stats {
            Section {
              LabeledContent("Shows", value: stats.shows.formatted())
              LabeledContent("Theatres", value: stats.venues.formatted())
              LabeledContent("Cities", value: stats.cities.formatted())
            }
          }
          if page.stats == nil {
            EmptyState(title: "This profile is private", systemImage: "lock") { Text(privateMessage(page)) }
              .listRowBackground(Color.clear)
          } else if page.entries.isEmpty {
            EmptyState(title: "No public shows yet", systemImage: "theatermasks") {
              Text("When @\(page.profile.handle) tracks a public show, it’ll appear here.")
            }
            .listRowBackground(Color.clear)
          } else {
            Section("Calendar") {
              ProfileCalendar(entries: page.entries.map { .init(id: $0.id, date: $0.date, title: $0.show.title) }) { id in
                withAnimation { proxy.scrollTo(id, anchor: .top) }
              }
            }
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
    .refreshable { await load() }
    .task(id: router.dataVersion) { await load() }
  }

  private func header(_ page: PublicPages.ProfilePage) -> some View {
    let p = page.profile
    let cover = page.entries.compactMap { $0.photoPath.flatMap { page.photos[$0] } }.prefix(3)
    return VStack(alignment: .leading, spacing: 0) {
      Group {
        if cover.isEmpty {
          Palette.tintFill.frame(height: 80)
        } else {
          HStack(spacing: 2) {
            ForEach(Array(cover), id: \.self) { url in
              RemoteImage(url: url)
                .frame(maxWidth: .infinity, maxHeight: 112)
                .clipped()
            }
          }
          .frame(height: 112)
        }
      }
      .accessibilityHidden(true)

      VStack(alignment: .leading, spacing: Space.m) {
        HStack(alignment: .bottom) {
          Avatar(name: p.name, url: p.avatarURL, size: 80)
            .overlay(Circle().strokeBorder(Color(.secondarySystemGroupedBackground), lineWidth: 4))
            .padding(.top, -40)
          Spacer()
          FollowButton(profile: p, viewer: page.viewer)
        }
        VStack(alignment: .leading, spacing: 2) {
          HStack(spacing: Space.s) {
            Text(verbatim: "@\(p.handle)")
              .font(.title2.bold())
              .accessibilityAddTraits(.isHeader)
            if p.isPrivate {
              Image(systemName: "lock.fill")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .accessibilityLabel("Private profile")
            }
          }
          if let name = p.displayName, !name.isEmpty {
            Text(name).font(.subheadline).foregroundStyle(.secondary)
          }
        }
        if let bio = p.bio, !bio.isEmpty {
          Text(bio).font(.body)
        }
        if let link = p.link, let url = URL(string: link) {
          // Borderless, like every control in this header: it shares one List
          // row, where a default-styled control takes taps on the whole row.
          Link(destination: url) {
            Label(Self.displayLink(link), systemImage: "link")
              .font(.subheadline.weight(.semibold))
              .lineLimit(1)
          }
          .buttonStyle(.borderless)
        }
        HStack(spacing: Space.l) {
          // Buttons, not NavigationLinks: this sits in a List row, which would add chevrons.
          Button { router.open(.follows(handle: p.handle, list: .followers)) } label: {
            count(page.follows.followers, page.follows.followers == 1 ? "follower" : "followers")
          }
          Button { router.open(.follows(handle: p.handle, list: .following)) } label: {
            count(page.follows.following, "following")
          }
        }
        .buttonStyle(.plain)
      }
      .padding(.horizontal, Space.l)
      .padding(.bottom, Space.l)
    }
    .groupedCard()
  }

  private func count(_ value: Int, _ label: String) -> some View {
    (Text("\(value)").fontWeight(.semibold).foregroundStyle(.primary)
      + Text(" \(label)").foregroundStyle(.secondary))
      .font(.subheadline)
      .monospacedDigit()
      .frame(minHeight: Space.touch)
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

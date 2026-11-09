import SwiftUI
import UIKit

/// The signed-in app: a native tab bar with Home (the feed), Log and
/// Profile (your diary and trips). Log isn't a screen: choosing it opens the
/// log sheet over the tab you were on. Each tab keeps its own navigation
/// stack, so switching tabs and back returns you where you were.
struct RootView: View {
  @Environment(AppSession.self) private var session
  @Environment(Membership.self) private var membership
  @Environment(PaywallRouter.self) private var paywall
  @Environment(\.scenePhase) private var scenePhase
  private var router: AppRouter { session.router }

  var body: some View {
    @Bindable var router = router
    TabView(selection: $router.tab) {
      tab(path: $router.homePath) { HomeView() }
        .tabItem { Label("Home", systemImage: "house") }
        .tag(AppRouter.Tab.home)
      Color.clear
        .tabItem { Label("Log", systemImage: "plus.circle.fill") }
        .tag(AppRouter.Tab.log)
        .accessibilityHint("Log a show")
      tab(path: $router.profilePath) { ProfileView() }
        .tabItem { Label("Profile", systemImage: "person.crop.circle") }
        .tag(AppRouter.Tab.profile)
    }
    .tint(Palette.tintText)
    .sheet(item: $router.log) { request in
      if request.photos.isEmpty {
        LogView(editing: request.editing)
      } else {
        ImportView(photos: request.photos)
      }
    }
    .sheet(item: $router.tripForm) { request in
      TripForm(request: request)
    }
    .environment(router)
    .paywallHost()
    .onChange(of: membership.isPro) { _, isPro in paywall.membershipChanged(isPro: isPro) }
    .task(id: session.userId) { await PushRegistration.shared.activate() }
    .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await PushRegistration.shared.refresh() } } }
    .onChange(of: PushRegistration.shared.activityVersion) { _, _ in router.dataChanged() }
    .onChange(of: PushRegistration.shared.openedNotification, initial: true) { _, id in
      guard let id else { return }
      PushRegistration.shared.openedNotification = nil
      router.open(.openNotification(id))
    }
    // Choosing Log opens the sheet and goes back to the tab you were on.
    .onChange(of: router.tab) { previous, picked in
      guard picked == .log else { return }
      router.tab = previous == .log ? .home : previous
      router.startLog()
    }
    .onChange(of: session.pendingLink, initial: true) { _, route in
      guard let route else { return }
      session.pendingLink = nil
      router.open(route)
    }
  }

  private func tab<Content: View>(path: Binding<[AppRouter.Route]>, @ViewBuilder content: () -> Content) -> some View {
    NavigationStack(path: path) {
      content()
        .navigationDestination(for: AppRouter.Route.self) { route in
          switch route {
          case .entry(let id, let notice): EntryView(id: id, notice: notice).id(id)
          case .trip(let id, let addFailed): TripView(id: id, addFailed: addFailed)
          case .trips: TripsList()
          case .settings: SettingsView()
          case .notifications: NotificationsView()
          case .openNotification(let id, let seenRevision): OpenNotificationView(id: id, seenRevision: seenRevision)
          case .followRequests: NotificationRequestsView()
          case .notificationSettings: NotificationSettingsView()
          case .editProfile: EditProfileView()
          case .importHub: ImportHubView()
          case .privacySettings: PrivacySettingsView()
          case .insights: InsightsView()
          case .insightVisits(let filter): InsightVisitsView(filter: filter)
          case .blockedAccounts: BlockedAccountsView()
          case .profile(let handle): PublicProfileView(handle: handle)
          case .publicEntry(let id, let comments): PublicEntryView(id: id, showComments: comments)
          case .publicTrip(let id): PublicTripView(id: id)
          case .follows(let handle, let list): FollowsListView(handle: handle, list: list)
          }
        }
    }
  }
}

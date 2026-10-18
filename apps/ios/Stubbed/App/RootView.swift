import SwiftUI
import UIKit

/// The signed-in app: a native tab bar with Home (the feed), Log and
/// Profile (your diary and trips). Log isn't a screen: choosing it opens the
/// log sheet over the tab you were on. Each tab keeps its own navigation
/// stack, so switching tabs and back returns you where you were.
struct RootView: View {
  @Environment(AppSession.self) private var session
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
        .accessibilityHint("Track a show")
      tab(path: $router.profilePath) { ProfileView() }
        .tabItem { Label("Profile", systemImage: "person.crop.circle") }
        .tag(AppRouter.Tab.profile)
    }
    .tint(Palette.tintText)
    .sheet(item: $router.log) { request in
      LogView(editing: request.editing)
    }
    .sheet(item: $router.tripForm) { request in
      TripForm(request: request)
    }
    .environment(router)
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
          case .entry(let id, let notice): EntryView(id: id, notice: notice)
          case .trip(let id, let addFailed): TripView(id: id, addFailed: addFailed)
          case .settings: SettingsView()
          case .profile(let handle): PublicProfileView(handle: handle)
          case .people: PeopleView()
          case .publicEntry(let id, let comments): PublicEntryView(id: id, showComments: comments)
          case .publicTrip(let id): PublicTripView(id: id)
          case .follows(let handle, let list): FollowsListView(handle: handle, list: list)
          }
        }
    }
  }
}

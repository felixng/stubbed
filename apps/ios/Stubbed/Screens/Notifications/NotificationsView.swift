import SwiftUI

struct NotificationsView: View {
  var body: some View {
    ContentUnavailableView("You’re all caught up", systemImage: "bell", description: Text("Likes, comments and follow activity will appear here."))
      .background(Color(.systemGroupedBackground))
      .navigationTitle("Notifications")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .topBarTrailing) {
        NavigationLink(value: AppRouter.Route.notificationSettings) { Image(systemName: "gearshape") }.accessibilityLabel("Notification settings")
      } }
  }
}

struct NotificationSettingsView: View {
  var body: some View {
    Form { Section { Text("Likes, comments and follow activity share one inbox across Stubbed.") } }
      .navigationTitle("Notification settings")
      .navigationBarTitleDisplayMode(.inline)
      .tabBarClearance()
  }
}

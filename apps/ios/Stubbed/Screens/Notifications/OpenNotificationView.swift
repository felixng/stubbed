import Supabase
import SwiftUI

struct OpenNotificationView: View {
  let id: UUID
  var seenRevision: Int64? = nil
  @Environment(AppRouter.self) private var router
  @State private var failed = false
  var body: some View {
    Group {
      if failed { ContentUnavailableView("Activity unavailable", systemImage: "bell", description: Text("Open Notifications to see your latest activity.")) }
      else { ProgressView("Opening activity…") }
    }.navigationTitle("Notifications").task {
      do {
        struct Target: Encodable { let notification_id: UUID; let seen_revision: Int64? }
        let path: String = try await supabase.rpc("notification_open", params: Target(notification_id: id, seen_revision: seenRevision)).execute().value
        router.dataChanged()
        guard let url = URL(string: path, relativeTo: AppConfig.current.webURL), let route = DeepLink.route(for: url.absoluteURL) else { failed = true; return }
        router.replaceTop(with: route)
      } catch { failed = true }
    }
  }
}

import SwiftUI
import UIKit

/// Contextual permission invitation, not an account preference or status row.
struct NotificationPermissionCallout: View {
  @State private var registration = PushRegistration.shared
  @State private var busy = false
  @Environment(\.scenePhase) private var scenePhase

  var body: some View {
    Group {
      if registration.permission != .allowed || registration.error != nil {
        Section {
          VStack(alignment: .leading, spacing: Space.m) {
            Label(title, systemImage: "bell.badge").font(.headline)
            Text(message).font(.subheadline).foregroundStyle(.secondary)
            Button(registration.permission == .blocked ? "Settings" : registration.permission == .allowed ? "Try again" : "Enable") { Task { await act() } }
              .accessibilityLabel(actionTitle)
              .buttonStyle(.borderedProminent).disabled(busy)
            if let error = registration.error {
              Text(error).font(.footnote).foregroundStyle(.red)
            }
          }
          .padding(.vertical, Space.s)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityIdentifier("notification-permission-callout")
        }
      }
    }
    .task { await registration.refresh() }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { Task { await registration.refresh() } }
    }
  }
  private var title: String {
    registration.permission == .blocked ? "Notifications are off" : registration.error != nil ? "Finish enabling notifications" : "Keep up with your activity"
  }
  private var message: String {
    registration.permission == .blocked
      ? "Allow notifications in iPhone Settings to hear about likes, comments and new followers. Your inbox is always here."
      : "Get a heads-up when someone likes your shows, leaves a comment or follows you."
  }
  private var actionTitle: String {
    registration.permission == .blocked ? "Open iPhone Settings" : registration.permission == .allowed ? "Try again" : "Enable notifications"
  }
  private func act() async {
    busy = true; defer { busy = false }
    if registration.permission == .blocked {
      if let url = URL(string: UIApplication.openNotificationSettingsURLString) { await UIApplication.shared.open(url) }
    } else if registration.permission == .needed { await registration.enable() }
    else { await registration.refresh() }
  }
}

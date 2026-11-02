import Foundation
import Testing
import UserNotifications
@testable import Stubbed

struct PushResponseTests {
  @Test @MainActor
  func backgroundCallbackStoresPendingOpenBeforeAcknowledgement() async {
    let push = PushRegistration()
    let id = UUID()
    await withCheckedContinuation { (acknowledged: CheckedContinuation<Void, Never>) in
      DispatchQueue.global().async {
        NativeNotificationResponse.receive(
          notificationID: id.uuidString, actionIdentifier: UNNotificationDefaultActionIdentifier,
          open: {
            MainActor.preconditionIsolated()
            push.openedNotification = $0
          },
          completion: { MainActor.preconditionIsolated(); acknowledged.resume() }
        )
      }
    }
    // No RootView is required: a cold-start tap is retained until sign-in is ready.
    #expect(push.openedNotification == id)
  }

  @Test(arguments: [nil, "", "not-a-uuid"] as [String?])
  func malformedPayloadIsAcknowledgedWithoutNavigation(rawID: String?) async {
    await withCheckedContinuation { (acknowledged: CheckedContinuation<Void, Never>) in
      DispatchQueue.global().async {
        NativeNotificationResponse.receive(
          notificationID: rawID, actionIdentifier: UNNotificationDefaultActionIdentifier,
          open: { _ in Issue.record("Malformed notifications must not navigate") },
          completion: { MainActor.preconditionIsolated(); acknowledged.resume() }
        )
      }
    }
  }

  @Test(arguments: [UNNotificationDismissActionIdentifier, "unsupported-action"])
  func nonOpeningActionsAreAcknowledgedWithoutNavigation(action: String) async {
    await withCheckedContinuation { (acknowledged: CheckedContinuation<Void, Never>) in
      DispatchQueue.global().async {
        NativeNotificationResponse.receive(
          notificationID: UUID().uuidString, actionIdentifier: action,
          open: { _ in Issue.record("Dismissing a notification must not navigate") },
          completion: { MainActor.preconditionIsolated(); acknowledged.resume() }
        )
      }
    }
  }
}

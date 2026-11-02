import Foundation
import Observation
import Supabase
import UIKit
import UserNotifications

enum PushPermission: String, Sendable {
  case needed = "Permission needed", allowed = "Allowed", blocked = "Blocked", unavailable = "Unavailable"
  static func from(_ status: UNAuthorizationStatus) -> PushPermission {
    switch status {
    case .notDetermined: .needed
    case .authorized, .provisional, .ephemeral: .allowed
    case .denied: .blocked
    @unknown default: .unavailable
    }
  }
}

protocol NativePermissionClient: Sendable {
  func status() async -> PushPermission
  func request() async throws -> PushPermission
}
struct ApplePermissionClient: NativePermissionClient {
  func status() async -> PushPermission { .from(await UNUserNotificationCenter.current().notificationSettings().authorizationStatus) }
  func request() async throws -> PushPermission {
    _ = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
    return await status()
  }
}
enum NativePermissionFlow {
  static func enable(using client: some NativePermissionClient) async throws -> PushPermission {
    let current = await client.status()
    return current == .needed ? try await client.request() : current
  }
}

@MainActor @Observable
final class PushRegistration {
  static let shared = PushRegistration()
  private(set) var permission = PushPermission.needed
  private(set) var error: String?
  var openedNotification: UUID?
  var activityVersion = 0
  private var token: String?
  private var signedIn = false
  private var cleaning = false
  private struct Installation: Codable { let installation: UUID; let secret: UUID }
  private var identity: Installation {
    if let data = UserDefaults.standard.data(forKey: "push-installation"), let saved = try? JSONDecoder().decode(Installation.self, from: data) { return saved }
    let new = Installation(installation: UUID(), secret: UUID())
    UserDefaults.standard.set(try? JSONEncoder().encode(new), forKey: "push-installation")
    return new
  }
  private var pending: [Installation] {
    get { UserDefaults.standard.data(forKey: "push-cleanup").flatMap { try? JSONDecoder().decode([Installation].self, from: $0) } ?? [] }
    set { UserDefaults.standard.set(try? JSONEncoder().encode(newValue), forKey: "push-cleanup") }
  }
  func activate() async {
    signedIn = true
    await retryCleanup()
    await refresh()
  }
  func refresh() async {
    permission = await ApplePermissionClient().status()
    guard signedIn else { return }
    if permission == .allowed { UIApplication.shared.registerForRemoteNotifications(); await register() }
    else { await removeCurrent() }
  }
  func enable() async {
    // A denied/revoked grant can only be changed in Settings. Never request it again.
    await refresh()
    guard signedIn, permission == .needed else { return }
    do { permission = try await NativePermissionFlow.enable(using: ApplePermissionClient()); await refresh() }
    catch { self.error = "Couldn’t request notification permission. Try again." }
  }
  func receivedToken(_ data: Data) async {
    token = data.map { String(format: "%02x", $0) }.joined()
    await register()
  }
  func registrationFailed() { error = "Couldn’t register this device. Check your connection and try again." }
  private func register() async {
    guard signedIn, permission == .allowed, let token else { return }
    let installation = identity
    struct Registration: Encodable { let installation: UUID; let secret: UUID; let token: String; let environment: String }
    #if DEBUG
    let environment = "sandbox"
    #else
    let environment = "production"
    #endif
    do {
      try await supabase.rpc("register_native_push", params: Registration(installation: installation.installation, secret: installation.secret, token: token, environment: environment)).execute()
      if !signedIn || identity.installation != installation.installation {
        try? await supabase.rpc("remove_push_installation", params: installation).execute()
      } else { error = nil }
    } catch { self.error = "Couldn’t enable delivery on this device. Try again." }
  }
  private func removeCurrent() async {
    do { try await supabase.rpc("remove_push_installation", params: identity).execute() }
    catch { self.error = "Couldn’t remove this device registration yet. We’ll retry." }
  }
  func prepareSignOut() async {
    guard signedIn else { return }
    signedIn = false
    pending += [identity]
    UserDefaults.standard.removeObject(forKey: "push-installation")
    await retryCleanup()
  }
  func retryCleanup() async {
    guard !cleaning else { return }
    cleaning = true; defer { cleaning = false }
    let old = pending
    guard !old.isEmpty else { return }
    var failed: [Installation] = []
    for installation in old {
      do { try await supabase.rpc("remove_push_installation", params: installation).execute() }
      catch { failed.append(installation) }
    }
    // A new identity after sign-out prevents late cleanup removing a new account's registration.
    let completed = Set(old.map(\.installation)).subtracting(failed.map(\.installation))
    pending = pending.filter { !completed.contains($0.installation) }
  }
}

/// A notification callback may arrive on UserNotifications' background queue.
/// Copy only its ID across to the main actor. UIKit's response completion also
/// updates UI state, so acknowledge there even for malformed IDs/dismissals.
/// Navigation waits for RootView.
enum NativeNotificationResponse {
  nonisolated static func receive(
    notificationID: String?, actionIdentifier: String,
    open: @escaping @MainActor @Sendable (UUID) -> Void,
    completion: @escaping @Sendable () -> Void
  ) {
    let id = actionIdentifier == UNNotificationDefaultActionIdentifier
      ? notificationID.flatMap(UUID.init(uuidString:)) : nil
    Task { @MainActor in
      if let id { open(id) }
      completion()
    }
  }
}

final class PushAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
  func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    UNUserNotificationCenter.current().delegate = self
    return true
  }
  func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    Task { await PushRegistration.shared.receivedToken(deviceToken) }
  }
  func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    Task { @MainActor in PushRegistration.shared.registrationFailed() }
  }
  // Keep the Objective-C entry points synchronous and explicitly nonisolated.
  // The async bridge completed on a cooperative queue, crashing UIKit's
  // post-tap state restoration. Both state changes and completion run on main.
  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter, willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping @Sendable (UNNotificationPresentationOptions) -> Void
  ) {
    // Shared inbox is the foreground presentation; no duplicate system banner.
    Task { @MainActor in
      PushRegistration.shared.activityVersion += 1
      completionHandler([])
    }
  }
  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping @Sendable () -> Void
  ) {
    NativeNotificationResponse.receive(
      notificationID: response.notification.request.content.userInfo["notification_id"] as? String,
      actionIdentifier: response.actionIdentifier,
      open: { PushRegistration.shared.openedNotification = $0 },
      completion: completionHandler
    )
  }
}

import Foundation
import Testing
import UserNotifications
@testable import Stubbed

struct PushPermissionTests {
  @Test func systemPermissionIsSeparateFromPreference() {
    #expect(PushPermission.from(.notDetermined) == .needed)
    #expect(PushPermission.from(.denied) == .blocked)
    #expect(PushPermission.from(.authorized) == .allowed)
    #expect(PushPermission.from(.provisional) == .allowed)
  }
  @Test func notificationLinksHaveTypedDestinations() {
    let id = UUID()
    #expect(DeepLink.route(for: URL(string: "https://getstubbed.app/app/notifications/open/\(id)")!, webHost: "getstubbed.app") == .openNotification(id))
    #expect(DeepLink.route(for: URL(string: "https://getstubbed.app/app/profile/requests")!, webHost: "getstubbed.app") == .followRequests)
    #expect(DeepLink.route(for: URL(string: "https://other.example/app/notifications/open/\(id)")!, webHost: "getstubbed.app") == nil)
  }
}

private actor FakePermissionClient: NativePermissionClient {
  var current: PushPermission
  var requests = 0
  init(_ current: PushPermission) { self.current = current }
  func status() -> PushPermission { current }
  func request() -> PushPermission { requests += 1; current = .blocked; return current }
}

struct PushPermissionFlowTests {
  @Test func refusalNeverReprompts() async throws {
    let client = FakePermissionClient(.needed)
    #expect(try await NativePermissionFlow.enable(using: client) == .blocked)
    #expect(try await NativePermissionFlow.enable(using: client) == .blocked)
    #expect(await client.requests == 1)
  }
  @Test func revokedPermissionNeverPrompts() async throws {
    let client = FakePermissionClient(.blocked)
    #expect(try await NativePermissionFlow.enable(using: client) == .blocked)
    #expect(await client.requests == 0)
  }
}

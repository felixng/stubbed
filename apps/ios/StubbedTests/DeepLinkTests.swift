import Foundation
import Testing
@testable import Stubbed

struct DeepLinkTests {
  private func route(_ s: String) -> AppRouter.Route? {
    DeepLink.route(for: URL(string: s)!, webHost: "getstubbed.app")
  }

  private let id = UUID(uuidString: "00000000-0000-4000-D000-000000000001")!

  @Test func opensSharedEntriesTripsAndProfiles() {
    #expect(route("https://getstubbed.app/e/00000000-0000-4000-d000-000000000001") == .publicEntry(id))
    #expect(route("https://getstubbed.app/e/00000000-0000-4000-d000-000000000001#comments") == .publicEntry(id, comments: true))
    #expect(route("https://www.getstubbed.app/t/00000000-0000-4000-d000-000000000001") == .publicTrip(id))
    #expect(route("https://getstubbed.app/@Felix") == .profile(handle: "felix"))
    #expect(route("https://getstubbed.app/@felix/followers") == .follows(handle: "felix", list: .followers))
    #expect(route("stubbed://e/00000000-0000-4000-d000-000000000001") == .publicEntry(id))
    #expect(route("stubbed://@ios_test") == .profile(handle: "ios_test"))
  }

  @Test func ignoresEverythingElse() {
    #expect(route("https://example.com/e/00000000-0000-4000-d000-000000000001") == nil)
    #expect(route("https://getstubbed.app/e/not-a-uuid") == nil)
    #expect(route("https://getstubbed.app/faq") == nil)
    #expect(route("https://getstubbed.app/@a") == nil)
    #expect(route("https://getstubbed.app/@felix/likes") == nil)
    #expect(route("stubbed://auth-callback?code=abc") == nil)
  }
}

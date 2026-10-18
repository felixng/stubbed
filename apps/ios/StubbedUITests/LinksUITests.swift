import XCTest

/// Universal links can't be verified on the Simulator without the live
/// site, so this opens the same paths through the app's own scheme.
final class LinksUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testLinksOpenProfilesAndEntries() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))

    app.open(URL(string: "stubbed://@ios_friend")!)
    XCTAssertTrue(app.staticTexts["Fringe every August."].waitForExistence(timeout: 15))

    app.open(URL(string: "stubbed://e/00000000-0000-4000-d000-000000000001#comments")!)
    XCTAssertTrue(app.staticTexts["Front mezz is the best seat in that house."].waitForExistence(timeout: 15))
    snapshot("link-entry")

    // A link to something that isn't public says so.
    app.open(URL(string: "stubbed://e/00000000-0000-4000-d000-000000000003")!)
    XCTAssertTrue(app.staticTexts["This show isn’t available"].waitForExistence(timeout: 15))
  }
}

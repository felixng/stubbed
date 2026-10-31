import XCTest

/// Reporting and blocking (#176, #144) with the seeded data: the test user
/// follows @ios_friend, who has public shows in the feed.
final class ModerationUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  private func friendProfile() throws -> XCUIApplication {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    app.buttons["Search people"].tap()
    let search = app.searchFields["Name or @handle"]
    XCTAssertTrue(search.waitForExistence(timeout: 10))
    search.tap()
    search.typeText("ios_friend")
    let result = button(app, startingWith: "@ios_friend")
    XCTAssertTrue(result.waitForExistence(timeout: 10))
    result.tap()
    XCTAssertTrue(app.staticTexts["Fringe every August."].waitForExistence(timeout: 10))
    return app
  }

  @MainActor
  func testReportAProfile() throws {
    let app = try friendProfile()
    app.buttons["More"].tap()
    app.buttons["Report"].tap()
    XCTAssertTrue(app.navigationBars["Report"].waitForExistence(timeout: 5))
    let send = app.navigationBars["Report"].buttons["Send"]
    XCTAssertFalse(send.isEnabled, "Send waits for a reason")
    app.buttons["Spam"].tap()
    snapshot("report")
    send.tap()
    XCTAssertTrue(app.staticTexts["Thanks for telling us"].waitForExistence(timeout: 10))
    app.navigationBars["Report"].buttons["Done"].tap()
    XCTAssertTrue(app.staticTexts["Fringe every August."].waitForExistence(timeout: 5))
  }

  @MainActor
  func testBlockThenUnblockFromSettings() throws {
    let app = try friendProfile()
    app.buttons["More"].tap()
    app.buttons["Block"].tap()
    app.sheets.buttons["Block"].firstMatch.tap()
    XCTAssertTrue(app.staticTexts["You’ve blocked @ios_friend"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.buttons["Following"].exists, "Blocking ends the follow")
    snapshot("blocked-profile")

    // Settings → Blocked accounts lists them, with Unblock.
    app.navigationBars.buttons.element(boundBy: 0).tap()
    openTab("Profile", in: app)
    app.buttons["Settings"].tap()
    scrollAndTap(app.buttons["Blocked accounts"], in: app)
    let unblock = app.buttons["Unblock @ios_friend"]
    XCTAssertTrue(unblock.waitForExistence(timeout: 10))
    snapshot("blocked-accounts")
    unblock.tap()
    app.sheets.buttons["Unblock"].firstMatch.tap()
    XCTAssertTrue(app.staticTexts["No one blocked"].waitForExistence(timeout: 10))
  }

  /// On their profile, not Home: the block test (which runs first) ends the
  /// test user's follow, so their posts may no longer be in the feed.
  @MainActor
  func testReportAPostByLongPress() throws {
    let app = try friendProfile()
    let note = app.staticTexts["Second time round and it still lands."]
    for _ in 0..<5 where !note.exists || !note.isHittable { app.collectionViews.firstMatch.swipeUp() }
    note.press(forDuration: 1.2)
    sleep(1)  // the menu animates in
    XCTAssertTrue(app.buttons["Report"].waitForExistence(timeout: 5))
    app.buttons["Report"].tap()
    XCTAssertTrue(app.navigationBars["Report"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.switches["Also block @ios_friend"].exists)
    app.navigationBars["Report"].buttons["Cancel"].tap()
  }
}

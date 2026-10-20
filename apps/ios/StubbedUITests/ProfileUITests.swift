import XCTest

/// Uses the seeded diary from scripts/test-seed.sql.
final class ProfileUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testProfileShowsHeaderUpcomingAndDiary() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    app.buttons["Profile"].tap()

    XCTAssertTrue(app.staticTexts["@ios_test"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["iOS Test"].exists)
    XCTAssertTrue(app.staticTexts["Upcoming"].waitForExistence(timeout: 10))
    snapshot("profile")
    // The diary is a List: rows below the fold are built as they scroll in.
    let hadestown = button(app, startingWith: "Hadestown")
    let hamilton = button(app, startingWith: "Hamilton")
    for _ in 0..<4 where !hadestown.exists { app.collectionViews.firstMatch.swipeUp() }
    XCTAssertTrue(hadestown.exists, app.debugDescription)
    for _ in 0..<4 where !hamilton.exists { app.collectionViews.firstMatch.swipeUp() }
    XCTAssertTrue(hamilton.exists, app.debugDescription)
    snapshot("profile-diary")

    scrollAndTap(hamilton, in: app)
    XCTAssertTrue(app.staticTexts["Lin's replacement was brilliant. Front mezz, row B."].waitForExistence(timeout: 10))
    snapshot("entry")
    app.swipeUp()
    snapshot("entry-details")
    // The trip row is below the share cards; the Form builds rows as they scroll in.
    let trip = app.buttons["NYC Oct 2026"]
    for _ in 0..<4 where !trip.exists { app.collectionViews.firstMatch.swipeUp() }
    XCTAssertTrue(trip.waitForExistence(timeout: 5), app.debugDescription)
  }
}

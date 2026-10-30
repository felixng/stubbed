import XCTest

/// Uses the seeded diary from scripts/test-seed.sql.
final class ProfileUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testDiaryTripsPicker() throws {
    let app = launchApp()
    if app.buttons["Profile"].waitForExistence(timeout: 5) { openTab("Profile", in: app) }
    if !app.staticTexts["@ios_test"].waitForExistence(timeout: 3) {
      signOutIfNeeded(app)
      try signIn(app)
      openTab("Profile", in: app)
    }
    let picker = app.segmentedControls["profile-sections"]
    for _ in 0..<8 where !picker.exists || !picker.isHittable {
      app.collectionViews.firstMatch.swipeUp()
    }
    XCTAssertTrue(picker.waitForExistence(timeout: 5))
    snapshot("profile-picker-diary")
    picker.buttons["Trips"].tap()
    XCTAssertTrue(app.buttons["New trip"].waitForExistence(timeout: 10))
    snapshot("profile-picker-trips")
    picker.buttons["Diary"].tap()
    XCTAssertTrue(app.staticTexts["Upcoming"].waitForExistence(timeout: 5))
  }

  @MainActor
  func testProfileShowsHeaderUpcomingAndDiary() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    openTab("Profile", in: app)

    XCTAssertTrue(app.staticTexts["@ios_test"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["iOS Test"].exists)
    // The owner activity summary now precedes the diary.
    for _ in 0..<4 where !app.staticTexts["Upcoming"].exists { app.collectionViews.firstMatch.swipeUp() }
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

import XCTest

/// Uses the seeded diary from scripts/test-seed.sql.
final class ProfileUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testYearSummaryAndTrips() throws {
    try checkYearSummaryAndTrips(accessibility: false)
  }

  @MainActor
  func testYearSummaryAccessibility() throws {
    try checkYearSummaryAndTrips(accessibility: true)
  }

  @MainActor
  private func checkYearSummaryAndTrips(accessibility: Bool) throws {
    let app = XCUIApplication()
    if accessibility {
      app.launchArguments = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
    }
    app.launch()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    openTab("Profile", in: app)
    if !accessibility { snapshot("profile-header") }
    let yearHeader = app.descendants(matching: .any)["profile-year-header"].firstMatch
    for _ in 0..<12 where !yearHeader.exists || !yearHeader.isHittable {
      let list = app.collectionViews.firstMatch
      list.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.75)).press(
        forDuration: 0.05,
        thenDragTo: list.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.55)))
    }
    XCTAssertTrue(yearHeader.exists)
    for _ in 0..<4 {
      let top = app.navigationBars.firstMatch.frame.maxY + 64
      let delta = yearHeader.frame.minY - top
      if delta < 25 { break }
      let list = app.collectionViews.firstMatch
      let start = list.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.8))
      start.press(forDuration: 0.05, thenDragTo: start.withOffset(
        CGVector(dx: 0, dy: -min(delta, app.frame.height * 0.4))),
        withVelocity: .slow, thenHoldForDuration: 0.3)
    }
    snapshot(accessibility ? "profile-year-accessibility" : "profile-year-overview")
    let trips = app.buttons["profile-trips"]
    revealControl(trips, in: app)
    XCTAssertTrue(trips.waitForExistence(timeout: 5))
    XCTAssertFalse(app.segmentedControls["profile-sections"].exists)
    snapshot(accessibility ? "profile-year-accessibility-links" : "profile-year-summary")
    trips.tap()
    XCTAssertTrue(app.navigationBars["Trips"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["New trip"].exists)
    snapshot(accessibility ? "profile-trips-accessibility" : "profile-trips-list")
    app.buttons["New trip"].tap()
    XCTAssertTrue(app.navigationBars["New trip"].waitForExistence(timeout: 5))
    app.buttons["Cancel"].tap()
    scrollAndTap(button(app, startingWith: "NYC Oct 2026"), in: app)
    XCTAssertTrue(app.navigationBars["NYC Oct 2026"].waitForExistence(timeout: 10))
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.navigationBars["Trips"].waitForExistence(timeout: 5))
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 5))
    scrollAndTap(app.buttons["profile-insights"], in: app)
    XCTAssertTrue(app.navigationBars["Insights"].waitForExistence(timeout: 10))
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
    let upcoming = app.staticTexts.matching(NSPredicate(format: "label ==[c] %@", "Upcoming")).firstMatch
    for _ in 0..<4 where !upcoming.exists { app.collectionViews.firstMatch.swipeUp() }
    XCTAssertTrue(upcoming.waitForExistence(timeout: 10))
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

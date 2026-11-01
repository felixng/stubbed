import XCTest

final class InsightShareUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }
  @MainActor func testCurrentHistoricalAndAllTimeCards() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    openTab("Profile", in: app)
    scrollAndTap(app.buttons["profile-insights"], in: app)
    XCTAssertTrue(app.navigationBars["Insights"].waitForExistence(timeout: 10))
    let share = app.buttons["insights-share"]
    XCTAssertTrue(share.waitForExistence(timeout: 10))
    share.tap()
    func card(_ name: String) -> XCUIElement {
      app.images.matching(NSPredicate(format: "label CONTAINS %@", name)).firstMatch
    }
    XCTAssertTrue(card("weekly streak").waitForExistence(timeout: 20))
    app.buttons["Gradient"].tap()
    snapshot("share-weekly-streak")
    card("weekly streak").swipeLeft()
    XCTAssertTrue(card("year in theatre").waitForExistence(timeout: 5))
    snapshot("share-year-in-theatre")
    card("year in theatre").swipeLeft()
    XCTAssertTrue(card("show mix").waitForExistence(timeout: 5))
    snapshot("share-show-mix")
    app.buttons["Transparent"].tap()
    app.buttons["Dark"].tap()
    snapshot("share-show-mix-transparent")
    XCTAssertFalse(app.buttons["Link"].exists)
    XCTAssertFalse(app.buttons["Copy text"].exists)
    app.navigationBars["Share"].buttons["Done"].tap()

    let picker = app.buttons["insights-year"]
    picker.tap()
    app.buttons["All time"].tap()
    XCTAssertTrue(app.staticTexts["Shows, all time"].waitForExistence(timeout: 10))
    share.tap()
    XCTAssertTrue(card("weekly streak").waitForExistence(timeout: 20))
    card("weekly streak").swipeLeft()
    XCTAssertTrue(card("show mix").waitForExistence(timeout: 5))
    XCTAssertFalse(card("year in theatre").exists)
    snapshot("share-all-time-mix")
    app.navigationBars["Share"].buttons["Done"].tap()

    picker.tap()
    app.buttons[String(Calendar.current.component(.year, from: Date()) - 1)].tap()
    share.tap()
    XCTAssertTrue(card("year in theatre").waitForExistence(timeout: 20))
    XCTAssertFalse(card("weekly streak").exists)
    snapshot("share-historical-year")
  }
}

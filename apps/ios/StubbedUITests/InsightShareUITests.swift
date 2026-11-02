import XCTest

final class InsightShareUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor func testSectionCardsAndPeriods() throws {
    let app = try openInsights()
    let sections = [
      ("overview", "year-in-theatre"), ("streaks", "weekly-streak"),
      ("activity", "activity"), ("repeats", "most-seen-shows"),
      ("countries", "around-the-world"), ("mix", "show-mix"), ("history", "year-by-year")
    ]
    for (section, design) in sections {
      let button = app.buttons["insights-share-\(section)"]
      reveal(button, in: app)
      XCTAssertGreaterThanOrEqual(button.frame.width, 44)
      XCTAssertGreaterThanOrEqual(button.frame.height, 44)
      snapshot("insights-section-\(section)")
      button.tap()
      let card = app.images["share-card-\(design)"]
      XCTAssertTrue(card.waitForExistence(timeout: 25))
      XCTAssertTrue(card.isHittable, "Section must open its own card")
      XCTAssertTrue(app.buttons["Background"].exists)
      XCTAssertFalse(app.buttons["Copy text"].exists)
      XCTAssertFalse(app.buttons["Link"].exists)
      snapshot("share-section-\(section)")
      if section == "repeats" {
        app.buttons["Background"].tap()
        app.buttons["Light"].tap()
        app.buttons["background-picker-done"].tap()
        snapshot("share-section-repeats-light")
        app.buttons["Background"].tap()
        app.buttons["Transparent"].tap()
        app.buttons["Dark text"].tap()
        app.buttons["background-picker-done"].tap()
        snapshot("share-section-repeats-transparent")
      }
      app.navigationBars["Share"].buttons["Done"].tap()
    }
    for _ in 0..<14 { app.collectionViews.firstMatch.swipeDown() }
    let picker = app.buttons["insights-year"]
    picker.tap()
    app.buttons["All time"].tap()
    XCTAssertTrue(app.staticTexts["Shows, all time"].waitForExistence(timeout: 10))
    app.buttons["insights-share-overview"].tap()
    XCTAssertTrue(app.images["share-card-year-in-theatre"].waitForExistence(timeout: 25))
    snapshot("share-section-all-time-overview")
    app.navigationBars["Share"].buttons["Done"].tap()
    picker.tap()
    app.buttons[String(Calendar.current.component(.year, from: Date()) - 1)].tap()
    reveal(app.buttons["insights-share-streaks"], in: app)
    app.buttons["insights-share-streaks"].tap()
    XCTAssertTrue(app.images["share-card-best-weekly-streak"].waitForExistence(timeout: 25))
    XCTAssertFalse(app.images["share-card-weekly-streak"].exists)
    snapshot("share-section-historical-best-streak")
  }

  @MainActor func testLazyStatsCardsAndCoralMap() throws {
    let app = try openInsights()
    reveal(app.buttons["insights-share-activity"], in: app)
    app.buttons["insights-share-activity"].tap()
    let activity = app.images["share-card-activity"]
    XCTAssertTrue(activity.waitForExistence(timeout: 20))
    XCTAssertTrue(activity.isHittable)
    XCTAssertFalse(app.images["share-card-most-seen-shows"].exists)
    snapshot("share-coral-activity")
    activity.swipeLeft()
    let repeats = app.images["share-card-most-seen-shows"]
    XCTAssertTrue(repeats.waitForExistence(timeout: 20))
    snapshot("share-coral-repeats")
    repeats.swipeLeft()
    let map = app.images["share-card-around-the-world"]
    XCTAssertTrue(map.waitForExistence(timeout: 20))
    snapshot("share-coral-map")
    app.buttons["Background"].tap()
    app.buttons["Light"].tap()
    app.buttons["background-picker-done"].tap()
    snapshot("share-coral-map-light")
    app.buttons["Background"].tap()
    app.buttons["Transparent"].tap()
    app.buttons["Dark text"].tap()
    app.buttons["background-picker-done"].tap()
    snapshot("share-coral-map-transparent")
    map.swipeRight()
    XCTAssertTrue(repeats.waitForExistence(timeout: 3))
    repeats.swipeRight()
    XCTAssertTrue(activity.waitForExistence(timeout: 3))
    XCTAssertTrue(app.buttons["More"].isEnabled)
    snapshot("share-coral-activity-cached")
  }

  @MainActor func testCompactSectionHeaders() throws {
    let app = try openInsights()
    reveal(app.buttons["insights-share-activity"], in: app)
    snapshot("insights-compact-activity")
    reveal(app.buttons["insights-share-repeats"], in: app)
    snapshot("insights-compact-repeats")
    app.buttons["insights-share-repeats"].tap()
    XCTAssertTrue(app.images["share-card-most-seen-shows"].waitForExistence(timeout: 25))
    snapshot("share-compact-repeats")
  }

  @MainActor private func openInsights() throws -> XCUIApplication {
    let app = launchApp()
    if app.buttons["Profile"].waitForExistence(timeout: 5) { openTab("Profile", in: app) }
    if !app.staticTexts["@ios_test"].waitForExistence(timeout: 3) {
      signOutIfNeeded(app)
      try signIn(app)
      XCTAssertTrue(onHome(app))
      openTab("Profile", in: app)
    }
    scrollAndTap(app.buttons["profile-insights"], in: app)
    XCTAssertTrue(app.navigationBars["Insights"].waitForExistence(timeout: 10))
    return app
  }

  @MainActor private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
    let list = app.collectionViews.firstMatch
    for _ in 0..<75 {
      if element.exists && element.isHittable && element.frame.maxY < app.frame.maxY - 110 { return }
      let from = list.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.75))
      let to = list.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.45))
      from.press(forDuration: 0.05, thenDragTo: to, withVelocity: .slow, thenHoldForDuration: 0.2)
    }
    XCTFail("Could not reveal \(element)")
  }
}

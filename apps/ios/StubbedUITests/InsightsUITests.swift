import XCTest

final class InsightsUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testAccessibilitySummary() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    openTab("Profile", in: app)
    snapshot("insights-accessibility-profile-top")
    scrollAndTap(app.buttons["profile-insights"], in: app)
    XCTAssertTrue(app.navigationBars["Insights"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["Explore a day"].waitForExistence(timeout: 10))
    snapshot("insights-accessibility")
  }

  @MainActor
  func testEmptyInsights() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app, newUser: true)
    XCTAssertTrue(app.staticTexts["Set up your profile"].waitForExistence(timeout: 15))
    tap(app.textFields["Name"])
    app.textFields["Name"].typeText("Insights Test")
    tap(app.textFields["Handle"])
    app.textFields["Handle"].typeText("ios_insights_new")
    app.scrollViews.firstMatch.swipeUp()
    app.buttons["Continue"].tap()
    XCTAssertTrue(onHome(app))
    openTab("Profile", in: app)
    scrollAndTap(app.buttons["profile-insights"], in: app)
    XCTAssertTrue(app.navigationBars["Insights"].waitForExistence(timeout: 10))
    XCTAssertTrue(
      app.staticTexts["0 unique shows · repeat visits included"].waitForExistence(timeout: 10))
    snapshot("insights-empty")
  }

  @MainActor
  func testProfileAndInsights() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    openTab("Profile", in: app)
    XCTAssertTrue(app.staticTexts["@ios_test"].waitForExistence(timeout: 10))
    let insights = app.buttons["profile-insights"]
    reveal(insights, in: app, top: 450)
    snapshot("insights-profile")
    insights.tap()
    XCTAssertTrue(app.navigationBars["Insights"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["Explore a day"].waitForExistence(timeout: 10))
    snapshot("insights-activity")
    reveal(app.descendants(matching: .any)["insights-current-weekly"].firstMatch, in: app, top: 130)
    snapshot("insights-streaks")
    reveal(
      app.descendants(matching: .any)["insights-countries-count"].firstMatch, in: app, top: 130)
    snapshot("insights-world")
    reveal(app.buttons["insights-type-musical"], in: app, top: 400)
    snapshot("insights-types")
    let musical = app.buttons["insights-type-musical"]
    scrollAndTap(musical, in: app)
    XCTAssertTrue(app.navigationBars["Musical"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["A musical evening"].waitForExistence(timeout: 10))
    snapshot("insights-type-shows")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    // Year picker can be reached by scrolling to the top; switching to All time
    // must not replace the Profile summary's current-year period.
    for _ in 0..<8 { app.swipeDown() }
    let explore = app.buttons["Explore a day"]
    XCTAssertTrue(explore.waitForExistence(timeout: 5))
    explore.tap()
    app.buttons["View shows"].tap()
    XCTAssertTrue(app.staticTexts["A new play"].waitForExistence(timeout: 10))
    snapshot("insights-day-shows")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    for _ in 0..<3 { app.swipeDown() }
    let picker = app.buttons["insights-year"]
    XCTAssertTrue(picker.waitForExistence(timeout: 5))
    picker.tap()
    app.buttons["All time"].tap()
    XCTAssertTrue(app.staticTexts["Shows, all time"].waitForExistence(timeout: 10))
    snapshot("insights-all-time")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 5))
  }
  @MainActor
  private func reveal(_ element: XCUIElement, in app: XCUIApplication, top: CGFloat) {
    let list = app.collectionViews.firstMatch
    for _ in 0..<35 {
      if element.exists && element.frame.minY >= top - 60 && element.frame.minY <= top + 60 {
        return
      }
      let movingDown = element.exists && element.frame.minY < top - 60
      let from = list.coordinate(
        withNormalizedOffset: CGVector(dx: 0.92, dy: movingDown ? 0.5 : 0.72))
      let to = list.coordinate(
        withNormalizedOffset: CGVector(dx: 0.92, dy: movingDown ? 0.65 : 0.57))
      from.press(forDuration: 0.05, thenDragTo: to)
    }
    XCTFail("Could not reveal \(element)")
  }

}

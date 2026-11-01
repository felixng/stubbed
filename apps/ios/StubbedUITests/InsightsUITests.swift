import XCTest

final class InsightsUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testAccessibilitySummary() throws {
    let app = launchApp()
    if app.buttons["Profile"].waitForExistence(timeout: 5) { openTab("Profile", in: app) }
    if !app.staticTexts["@ios_test"].waitForExistence(timeout: 3) {
      signOutIfNeeded(app)
      try signIn(app)
      XCTAssertTrue(onHome(app))
      openTab("Profile", in: app)
    }
    snapshot("insights-accessibility-profile-top")
    reveal(app.buttons["profile-insights"], in: app)
    snapshot("insights-accessibility-profile")
    app.buttons["profile-insights"].tap()
    XCTAssertTrue(app.navigationBars["Insights"].waitForExistence(timeout: 10))
    reveal(app.otherElements["activity-heatmap"], in: app, snapshots: "insights-accessibility-grid")
    snapshot("insights-accessibility")
  }

  @MainActor
  func testEmptyInsights() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app, newUser: true)
    XCTAssertTrue(app.staticTexts["Set up your profile"].waitForExistence(timeout: 15))
    scrollAndTap(app.textFields["Name"], in: app)
    app.textFields["Name"].typeText("Insights Test\n")
    app.textFields["Handle"].typeText("ios_insights_new")
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
    // Reuse the correct local test session; authentication is covered by
    // SignInUITests and need not be repeated for every screenshot run.
    if app.buttons["Profile"].waitForExistence(timeout: 5) { openTab("Profile", in: app) }
    if !app.staticTexts["@ios_test"].waitForExistence(timeout: 3) {
      signOutIfNeeded(app)
      try signIn(app)
      XCTAssertTrue(onHome(app))
      openTab("Profile", in: app)
    }
    XCTAssertTrue(app.staticTexts["@ios_test"].waitForExistence(timeout: 10))
    let insights = app.buttons["profile-insights"]
    reveal(insights, in: app)
    snapshot("insights-profile")
    insights.tap()
    XCTAssertTrue(app.navigationBars["Insights"].waitForExistence(timeout: 10))
    reveal(app.otherElements["activity-heatmap"], in: app)
    XCTAssertTrue(app.otherElements["activity-heatmap"].waitForExistence(timeout: 10))
    snapshot("insights-activity")
    // Capture overlapping pages instead of trying to infer chart positions
    // from SwiftUI's grouped accessibility frames.
    for page in 0..<14 {
      let list = app.collectionViews.firstMatch
      let from = list.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.75))
      let to = list.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.55))
      from.press(forDuration: 0.05, thenDragTo: to, withVelocity: .slow, thenHoldForDuration: 0.3)
      snapshot("insights-page-\(page)")
    }
    for _ in 0..<8 { app.collectionViews.firstMatch.swipeDown() }
    reveal(app.buttons["insights-type-musical"], in: app)
    let musical = app.buttons["insights-type-musical"]
    scrollAndTap(musical, in: app)
    XCTAssertTrue(app.navigationBars["Musical"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["A musical evening"].waitForExistence(timeout: 10))
    snapshot("insights-type-shows")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    // Year picker can be reached by scrolling to the top; switching to All time
    // must not replace the Profile summary's current-year period.
    for _ in 0..<8 { app.swipeDown() }
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
  private func reveal(_ element: XCUIElement, in app: XCUIApplication, snapshots: String? = nil) {
    let list = app.collectionViews.firstMatch
    for step in 0..<50 {
      if element.exists && element.isHittable { return }
      let from = list.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.75))
      let to = list.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.55))
      from.press(forDuration: 0.05, thenDragTo: to, withVelocity: .slow, thenHoldForDuration: 0.3)
      if let snapshots { snapshot("\(snapshots)-\(step)") }
    }
    snapshot("insights-reveal-failed")
    XCTFail("Could not reveal \(element)")
  }

}

import XCTest

/// Every locked state, with the DEBUG-only `-paywallPreview free` argument faking gates, sales
/// and a Free membership against the local database (which has them off).
final class PaywallPreviewUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  private func launchFree() throws -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments += ["-paywallPreview", "free"]
    app.launch()
    if app.buttons["Profile"].waitForExistence(timeout: 5) { openTab("Profile", in: app) }
    if !app.staticTexts["@ios_test"].waitForExistence(timeout: 3) {
      signOutIfNeeded(app)
      try signIn(app)
      XCTAssertTrue(onHome(app))
      openTab("Profile", in: app)
    }
    return app
  }

  @MainActor
  func testLockedStatesOpenTheOnePaywall() throws {
    let app = try launchFree()

    // Profile callout.
    let banner = app.otherElements["pro-banner"]
    scrollAndTap(app.buttons["profile-insights"], in: app)
    app.navigationBars.buttons.element(boundBy: 0).tap()
    reveal(banner, in: app)
    snapshot("paywall-profile-callout")
    app.buttons["pro-banner-upgrade"].tap()
    XCTAssertTrue(app.otherElements["paywall"].waitForExistence(timeout: 5)
      || app.staticTexts["paywall-unavailable"].waitForExistence(timeout: 5))
    snapshot("paywall-sheet")
    app.buttons["Close"].tap()

    // Insights: Show mix locked in place.
    scrollAndTap(app.buttons["profile-insights"], in: app)
    XCTAssertTrue(app.navigationBars["Insights"].waitForExistence(timeout: 10))
    reveal(app.buttons["insights-share-mix"], in: app)
    snapshot("paywall-insights-show-mix-locked")

    // A locked period opens the paywall and stays on this year.
    for _ in 0..<6 { app.collectionViews.firstMatch.swipeDown() }
    app.buttons["insights-year"].tap()
    app.buttons["All time"].tap()
    XCTAssertTrue(app.staticTexts["paywall-unavailable"].waitForExistence(timeout: 5))
    snapshot("paywall-period-locked")
    app.buttons["Close"].tap()

    // A locked card: the share sheet opens on the Show mix card.
    reveal(app.buttons["insights-share-mix"], in: app)
    app.buttons["insights-share-mix"].tap()
    let card = app.descendants(matching: .any)["share-card-locked-show-mix"]
    let found = card.waitForExistence(timeout: 20)
    snapshot("paywall-card-locked")
    XCTAssertTrue(found)
    XCTAssertFalse(app.buttons["Download"].isEnabled)
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

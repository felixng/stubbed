import XCTest

/// The landing page's screenshots, run only by `scripts/dev marketing`
/// against the local @sillyelphaba diary (scripts/marketing-seed.sql). Each
/// snapshot is one picture on the page; copy them with
/// apps/web/scripts/landing-shots.sh.
final class MarketingUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testCaptureLandingScreens() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    // Photos load after the rows: give them time before each capture.
    sleep(3)
    snapshot("hero")

    app.buttons["Profile"].tap()
    XCTAssertTrue(app.staticTexts["@sillyelphaba"].waitForExistence(timeout: 10))
    let lostBoys = button(app, startingWith: "The Lost Boys")
    for _ in 0..<4 where !lostBoys.isHittable { app.collectionViews.firstMatch.swipeUp(velocity: .slow) }
    app.collectionViews.firstMatch.swipeUp(velocity: .slow)
    sleep(3)
    snapshot("history")

    app.collectionViews.firstMatch.swipeDown()
    app.collectionViews.firstMatch.swipeDown()
    scrollAndTap(lostBoys, in: app)
    let entryBar = app.navigationBars["The Lost Boys"]
    XCTAssertTrue(entryBar.waitForExistence(timeout: 10), app.debugDescription)
    entryBar.buttons["Edit"].tap()
    XCTAssertTrue(app.navigationBars["Edit"].waitForExistence(timeout: 10))
    sleep(3)
    snapshot("log")
    app.buttons["Cancel"].tap()

    scrollAndTap(app.buttons["Share this show"], in: app)
    XCTAssertTrue(app.navigationBars["Share"].waitForExistence(timeout: 5))
    let card = app.images.matching(NSPredicate(format: "label BEGINSWITH %@", "Share card 1 of 3")).firstMatch
    XCTAssertTrue(card.waitForExistence(timeout: 15))
    sleep(3)
    snapshot("share")
    app.navigationBars["Share"].buttons["Done"].tap()

    app.navigationBars.buttons.firstMatch.tap()
    let trips = app.segmentedControls.buttons["Trips"]
    for _ in 0..<6 where !trips.isHittable { app.collectionViews.firstMatch.swipeDown() }
    trips.tap()
    scrollAndTap(button(app, startingWith: "Birthday weekend"), in: app)
    // The trip's card preview draws last.
    sleep(8)
    snapshot("plan")
  }
}

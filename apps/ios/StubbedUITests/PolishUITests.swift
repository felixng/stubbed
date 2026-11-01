import XCTest

final class PolishUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor func testRatingGesturesLeaveVerticalScrollingAlone() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    openTab("Profile", in: app)
    scrollAndTap(button(app, startingWith: "Hamilton"), in: app)
    app.buttons["Edit"].firstMatch.tap()
    let rating = app.otherElements["Rating"]
    for _ in 0..<5 where !rating.exists || !rating.isHittable { app.collectionViews.firstMatch.swipeUp() }
    XCTAssertEqual(rating.value as? String, "4.5 stars")
    let origin = rating.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0.5))
      .withOffset(CGVector(dx: 75, dy: 0))
    origin.press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: 0, dy: -120)))
    XCTAssertEqual(rating.value as? String, "4.5 stars", "Scrolling from the stars must not change the rating")
    for _ in 0..<4 where !rating.isHittable { app.collectionViews.firstMatch.swipeDown() }
    let point = rating.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0.5))
      .withOffset(CGVector(dx: 20 + 81, dy: 0))
    point.tap()
    XCTAssertEqual(rating.value as? String, "2.5 stars")
    point.tap()
    XCTAssertEqual(rating.value as? String, "No rating", "Tapping the same value clears it")
    rating.swipeRight()
    XCTAssertEqual(rating.value as? String, "5 stars")
    XCTAssertFalse(app.staticTexts["5 / 5"].exists)
    snapshot("rating-input")
    app.buttons["Cancel"].tap()
    app.buttons["Discard"].firstMatch.tap()
  }

  @MainActor func testFeedAccessibilityAndLargeText() throws {
    let app = XCUIApplication()
    app.launchArguments = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
    app.launch()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    let profile = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "@ios_friend")).firstMatch
    XCTAssertTrue(profile.exists)
    XCTAssertTrue(app.buttons["Like"].firstMatch.exists)
    XCTAssertTrue(app.buttons["Comment"].firstMatch.exists)
    snapshot("home-accessibility")
    try app.performAccessibilityAudit(for: [.elementDetection, .sufficientElementDescription])
    openTab("Profile", in: app)
    let approve = app.buttons["Approve @ios_fan"]
    for _ in 0..<10 where !approve.exists || !approve.isHittable { app.collectionViews.firstMatch.swipeUp() }
    let decline = app.buttons["Decline @ios_fan"]
    let tabBarTop = app.buttons["Log"].frame.minY
    for _ in 0..<4 where approve.frame.maxY > tabBarTop - 8 { app.collectionViews.firstMatch.swipeUp() }
    XCTAssertTrue(approve.isHittable)
    XCTAssertTrue(decline.isHittable)
    XCTAssertLessThanOrEqual(decline.frame.maxX, app.frame.maxX)
    snapshot("follow-request-accessibility")
    app.buttons["Log"].tap()
    XCTAssertTrue(app.navigationBars["Log a show"].waitForExistence(timeout: 10))
    snapshot("log-start-accessibility")
    app.buttons["No photo? Fill in by hand"].tap()
    let rating = app.otherElements["Rating"]
    for _ in 0..<8 where !rating.exists || !rating.isHittable { app.collectionViews.firstMatch.swipeUp() }
    XCTAssertTrue(rating.isHittable)
    XCTAssertEqual(rating.value as? String, "No rating")
    snapshot("rating-accessibility")
    app.buttons["Cancel"].tap()
  }
}

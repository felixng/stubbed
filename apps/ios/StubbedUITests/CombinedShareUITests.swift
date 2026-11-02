import XCTest

final class CombinedShareUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }
  @MainActor func testAllEightCardsFromOneShow() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    openTab("Profile", in: app)
    scrollAndTap(button(app, startingWith: "Operation Mincemeat"), in: app)
    app.buttons["Edit"].firstMatch.tap()
    scrollAndTap(app.buttons["Add photo"], in: app)
    // Any local simulator photo exercises sharing; the SE picker initially
    // exposes older stock photos rather than the timestamped import fixture.
    let photo = app.images.matching(NSPredicate(format: "label BEGINSWITH %@", "Photo,")).firstMatch
    XCTAssertTrue(photo.waitForExistence(timeout: 15))
    photo.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    XCTAssertTrue(app.buttons["Change photo"].waitForExistence(timeout: 15))
    app.navigationBars["Edit"].buttons["Save"].tap()
    scrollAndTap(app.buttons["Share this show"], in: app)
    func card(_ name: String) -> XCUIElement {
      app.images.matching(NSPredicate(format: "label CONTAINS %@", name)).firstMatch
    }
    XCTAssertTrue(card("1 of 8").waitForExistence(timeout: 25))
    XCTAssertFalse(app.buttons["Background"].isEnabled)
    card("data + photo").swipeLeft()
    XCTAssertTrue(card("rating + photo").waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["Background"].isEnabled)
    card("rating + photo").swipeLeft()
    XCTAssertTrue(card("3 of 8").waitForExistence(timeout: 5))
    card("3 of 8").swipeLeft()
    XCTAssertTrue(card("first visit").waitForExistence(timeout: 5))
    snapshot("combined-first-visit")
    card("first visit").swipeLeft()
    XCTAssertTrue(card("show number").waitForExistence(timeout: 5))
    card("show number").swipeLeft()
    XCTAssertTrue(card("weekly streak").waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["Copy text"].exists)
    XCTAssertFalse(app.buttons["Link"].exists)
    app.buttons["Background"].tap()
    app.buttons["Transparent"].tap()
    app.buttons["Dark text"].tap()
    app.buttons["background-picker-done"].tap()
    XCTAssertTrue(card("no background").waitForExistence(timeout: 5))
    snapshot("combined-weekly-streak")
    card("weekly streak").swipeLeft()
    XCTAssertTrue(card("year in theatre").waitForExistence(timeout: 5))
    card("year in theatre").swipeLeft()
    XCTAssertTrue(card("show mix").waitForExistence(timeout: 5))
    snapshot("combined-show-mix")
    card("show mix").swipeRight()
    card("year in theatre").swipeRight()
    card("weekly streak").swipeRight()
    XCTAssertTrue(card("show number").waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["Copy text"].exists)
    XCTAssertTrue(app.buttons["Link"].exists)
  }
}

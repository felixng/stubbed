import XCTest

/// Uses the seeded diary from scripts/test-seed.sql.
final class ShareUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testEntryCardsDrawAndShareActionsWork() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    app.buttons["Profile"].tap()
    scrollAndTap(button(app, startingWith: "Operation Mincemeat"), in: app)
    // The cards live on the Share screen, opened from the entry.
    scrollAndTap(app.buttons["Share this show"], in: app)
    XCTAssertTrue(app.navigationBars["Share"].waitForExistence(timeout: 5))

    let card = app.images.matching(NSPredicate(format: "label BEGINSWITH %@", "Share card 1 of 3")).firstMatch
    XCTAssertTrue(card.waitForExistence(timeout: 15))
    snapshot("share-1")
    card.swipeLeft()
    XCTAssertTrue(app.images.matching(NSPredicate(format: "label BEGINSWITH %@", "Share card 2 of 3")).firstMatch
      .waitForExistence(timeout: 5))
    snapshot("share-2")
    app.images.matching(NSPredicate(format: "label BEGINSWITH %@", "Share card 2 of 3")).firstMatch.swipeLeft()
    sleep(1)
    snapshot("share-3")

    app.buttons["Background"].tap()
    XCTAssertTrue(app.images.matching(NSPredicate(format: "label ENDSWITH %@", "no background")).firstMatch
      .waitForExistence(timeout: 5))
    snapshot("share-clear")

    app.buttons["Copy text"].tap()
    XCTAssertTrue(app.staticTexts["Text copied."].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["Link"].exists, "A public entry offers its link")
  }
}

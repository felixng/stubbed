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

    // Two designs: Stats, then Name only.
    let card = app.images.matching(NSPredicate(format: "label BEGINSWITH %@", "Share card 1 of 2, stats")).firstMatch
    XCTAssertTrue(card.waitForExistence(timeout: 15))
    snapshot("share-1")
    card.swipeLeft()
    XCTAssertTrue(app.images.matching(NSPredicate(format: "label BEGINSWITH %@", "Share card 2 of 2, name only")).firstMatch
      .waitForExistence(timeout: 5))
    snapshot("share-2")

    // Operation Mincemeat is rated 5, so the rating starts shown; the
    // toggle swaps in the cards without it.
    app.buttons["Rating shown"].tap()
    XCTAssertTrue(app.buttons["Rating hidden"].waitForExistence(timeout: 5))
    snapshot("share-no-rating")
    app.buttons["Rating hidden"].tap()
    XCTAssertTrue(app.buttons["Rating shown"].waitForExistence(timeout: 5))

    app.buttons["Background"].tap()
    XCTAssertTrue(app.images.matching(NSPredicate(format: "label ENDSWITH %@", "no background")).firstMatch
      .waitForExistence(timeout: 5))
    snapshot("share-clear")

    // The action row scrolls sideways; Rating pushed Copy text off the
    // edge. Drag the row (a swipe on a button can tap it).
    let row = app.buttons["More"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    row.press(forDuration: 0.1, thenDragTo: row.withOffset(CGVector(dx: -260, dy: 0)))
    app.buttons["Copy text"].tap()
    XCTAssertTrue(app.staticTexts["Text copied."].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["Link"].exists, "A public entry offers its link")
  }
}

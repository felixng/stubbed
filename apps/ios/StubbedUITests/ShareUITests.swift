import XCTest

final class ShareUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }
  @MainActor func testEntryCardsDrawAndShareActionsWork() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    openTab("Profile", in: app)
    scrollAndTap(button(app, startingWith: "Operation Mincemeat"), in: app)
    scrollAndTap(app.buttons["Share this show"], in: app)
    XCTAssertTrue(app.navigationBars["Share"].waitForExistence(timeout: 5))
    let card = app.images.matching(NSPredicate(format: "label BEGINSWITH %@", "Share card 1 of")).firstMatch
    XCTAssertTrue(card.waitForExistence(timeout: 20))
    XCTAssertFalse(app.buttons["Rating shown"].exists)
    XCTAssertFalse(app.buttons["Rating hidden"].exists)
    XCTAssertTrue(card.label.contains("no background"))
    XCTAssertTrue(app.buttons["Copy"].exists)
    XCTAssertGreaterThan(app.buttons["Copy"].frame.minX, app.buttons["Stories"].frame.minX)
    XCTAssertGreaterThan(app.buttons["More"].frame.minX, app.buttons["Download"].frame.minX)
    app.buttons["Copy"].tap()
    XCTAssertTrue(app.staticTexts["Image copied. Paste it into your story."].waitForExistence(timeout: 5))
    snapshot("share-data-default-transparent")
    app.buttons["Background"].tap()
    let sheetTitle = app.staticTexts["Pick a background"]
    XCTAssertTrue(sheetTitle.waitForExistence(timeout: 5))
    // The whole card stays visible above the sheet, so each choice shows.
    func cardClearOfSheet() {
      sleep(1)
      let shown = app.images.matching(NSPredicate(format: "label BEGINSWITH %@", "Share card")).firstMatch
      XCTAssertLessThanOrEqual(shown.frame.maxY, sheetTitle.frame.minY, "The sheet covers the card")
    }
    cardClearOfSheet()
    XCTAssertTrue(app.buttons["Dark text"].exists, "No-photo cards start transparent")
    app.buttons["Light"].tap()
    sleep(1)
    snapshot("share-data-light")
    app.buttons["Transparent"].tap()
    XCTAssertTrue(app.images.matching(NSPredicate(format: "label ENDSWITH %@", "no background")).firstMatch.waitForExistence(timeout: 5))
    app.buttons["Dark text"].tap()
    cardClearOfSheet()
    snapshot("share-data-transparent")
    app.buttons["Gradient"].tap()
    XCTAssertFalse(app.buttons["Dark text"].exists)
    snapshot("share-data-gradient")
    app.buttons["background-picker-done"].tap()
    scrollAndTap(app.buttons["Copy text"], in: app)
    XCTAssertTrue(app.staticTexts["Text copied."].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["Link"].exists)
  }
}

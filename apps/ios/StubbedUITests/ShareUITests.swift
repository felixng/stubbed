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
    snapshot("share-data-solid")
    app.buttons["Transparent"].tap()
    XCTAssertTrue(app.images.matching(NSPredicate(format: "label ENDSWITH %@", "no background")).firstMatch.waitForExistence(timeout: 5))
    app.buttons["Dark"].tap()
    snapshot("share-data-transparent")
    app.buttons["Gradient"].tap()
    snapshot("share-data-gradient")
    scrollAndTap(app.buttons["Copy text"], in: app)
    XCTAssertTrue(app.staticTexts["Text copied."].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["Link"].exists)
  }
}

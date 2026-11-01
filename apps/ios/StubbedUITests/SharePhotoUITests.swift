import XCTest

final class SharePhotoUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor func testPhotoCardsIgnoreBackgroundAndRepeatVisitHasEncore() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    openTab("Profile", in: app)
    scrollAndTap(button(app, startingWith: "Operation Mincemeat"), in: app)
    app.buttons["Edit"].firstMatch.tap()
    scrollAndTap(app.buttons["Add photo"], in: app)
    pickPhoto(app, takenInNewYork: "2026-10-03 19:58")
    XCTAssertTrue(app.buttons["Change photo"].waitForExistence(timeout: 15))
    app.navigationBars["Edit"].buttons["Save"].tap()
    scrollAndTap(app.buttons["Share this show"], in: app)

    func card(_ name: String) -> XCUIElement {
      app.images.matching(NSPredicate(format: "label CONTAINS %@", name)).firstMatch
    }
    XCTAssertTrue(card("data + photo").waitForExistence(timeout: 20))
    XCTAssertFalse(app.segmentedControls["share-background"].exists)
    snapshot("share-photo-data")
    card("data + photo").swipeLeft()
    XCTAssertTrue(card("rating + photo").waitForExistence(timeout: 5))
    XCTAssertFalse(app.segmentedControls["share-background"].exists)
    snapshot("share-photo-rating")
    card("rating + photo").swipeLeft()
    XCTAssertTrue(app.buttons["Transparent"].waitForExistence(timeout: 5))
    app.buttons["Transparent"].tap()
    card("no background").swipeRight()
    XCTAssertTrue(card("rating + photo").waitForExistence(timeout: 5))
    XCTAssertFalse(card("rating + photo").label.contains("no background"))
    XCTAssertFalse(app.segmentedControls["share-background"].exists)
    snapshot("share-photo-after-transparent")
    card("rating + photo").swipeLeft()
    XCTAssertTrue(app.buttons["Transparent"].isSelected)
    card("no background").swipeLeft()
    XCTAssertTrue(card("show number").waitForExistence(timeout: 5))
    app.buttons["Gradient"].tap()
    snapshot("share-show-number")
    app.navigationBars["Share"].buttons["Done"].tap()

    // A second logged visit uses the existing show, with no photo or rating.
    // It must offer Encore without inventing a photo/rating card.
    tabButton("Log", in: app).tap()
    app.buttons["No photo? Fill in by hand"].tap()
    app.buttons["Search shows"].tap()
    tap(app.searchFields["Search shows"])
    app.searchFields["Search shows"].typeText("Operation Mincemeat")
    scrollAndTap(button(app, startingWith: "Operation Mincemeat"), in: app)
    app.buttons["Search venues"].tap()
    tap(app.searchFields["Search venues"])
    app.searchFields["Search venues"].typeText("Golden Theatre")
    scrollAndTap(button(app, startingWith: "Golden Theatre"), in: app)
    app.navigationBars.buttons["Save"].tap()
    XCTAssertTrue(app.navigationBars["Share"].waitForExistence(timeout: 20))
    let first = app.images.matching(NSPredicate(format: "label BEGINSWITH %@", "Share card 1 of")).firstMatch
    XCTAssertTrue(first.waitForExistence(timeout: 20))
    first.swipeLeft()
    XCTAssertTrue(card("encore").waitForExistence(timeout: 5))
    app.buttons["Gradient"].tap()
    snapshot("share-encore")
  }
}

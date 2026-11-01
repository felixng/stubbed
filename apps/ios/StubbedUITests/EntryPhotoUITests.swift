import XCTest

final class EntryPhotoUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor func testOwnEntryPhotoAndEmptyPhotoAction() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    openTab("Profile", in: app)
    scrollAndTap(button(app, startingWith: "Hamilton"), in: app)
    XCTAssertFalse(app.otherElements["entry-photo"].exists)
    snapshot("entry-no-photo")
    scrollAndTap(app.buttons["Add a photo"], in: app)
    XCTAssertTrue(app.navigationBars["Edit"].waitForExistence(timeout: 5))
    scrollAndTap(app.buttons["Add photo"], in: app)
    pickPhoto(app, takenInNewYork: "2026-10-03 19:58")
    XCTAssertTrue(app.buttons["Change photo"].waitForExistence(timeout: 15))
    app.navigationBars["Edit"].buttons["Save"].tap()
    let photo = app.otherElements["entry-photo"]
    XCTAssertTrue(photo.waitForExistence(timeout: 15))
    // Editing returns to the same scroll position; bring the leading image into view.
    for _ in 0..<4 where !photo.isHittable { app.collectionViews.firstMatch.swipeDown() }
    XCTAssertTrue(photo.isHittable)
    XCTAssertEqual(photo.frame.width / photo.frame.height, 0.8, accuracy: 0.02)
    XCTAssertFalse(app.buttons["Add a photo"].exists)
    snapshot("entry-saved")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    scrollAndTap(button(app, startingWith: "Hamilton"), in: app)
    XCTAssertTrue(photo.waitForExistence(timeout: 15))
    snapshot("entry")
    app.collectionViews.firstMatch.swipeUp(velocity: .slow)
    snapshot("entry-details")
    XCTAssertTrue(app.staticTexts["Lin's replacement was brilliant. Front mezz, row B."].exists)
  }
}

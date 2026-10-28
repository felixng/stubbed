import XCTest

/// Uses scripts/fixtures/curtain-call.jpg, which `scripts/dev ui` adds to
/// the Simulator's photos: taken on 3 Oct 2026 outside the Richard Rodgers
/// Theatre, which the seeded catalogue has at that spot.
final class PhotoLogUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testPhotoFillsDateAndNearbyTheatre() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    app.buttons["Log"].tap()
    let start = app.buttons["Start with a photo"]
    XCTAssertTrue(start.waitForExistence(timeout: 10), app.debugDescription)
    start.tap()

    // Wait for the picker, then pick curtain-call.jpg.
    XCTAssertTrue(app.images.firstMatch.waitForExistence(timeout: 15), app.debugDescription)
    snapshot("photo-picker")
    pickPhoto(app, takenInNewYork: "2026-10-03 19:58")

    // With the web server reachable, OpenStreetMap may find a second
    // theatre in range: then the app offers chips instead of choosing.
    let filled = button(app, startingWith: "Change Richard Rodgers Theatre")
    let chip = button(app, startingWith: "Richard Rodgers Theatre ·")
    XCTAssertTrue(filled.waitForExistence(timeout: 20) || chip.exists)
    XCTAssertTrue(app.buttons["Yesterday"].exists)
    let status = app.staticTexts.matching(
      NSPredicate(format: "label IN %@", ["Couldn’t work out the show.", "Show detection isn’t set up yet."])
    ).firstMatch
    XCTAssertTrue(status.waitForExistence(timeout: 30))
    snapshot("photo-filled")

    app.buttons["Cancel"].tap()
    app.buttons["Discard"].firstMatch.tap()
  }
}

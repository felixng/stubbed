import XCTest

/// Uses scripts/fixtures/curtain-call.jpg, which `scripts/dev ui` adds to
/// the Simulator's photos: taken on 3 Oct 2026 outside the Richard Rodgers
/// Theatre, which the seeded catalogue has at that spot.
final class PhotoLogUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// Removing the photo clears what it filled, a theatre picked from its
  /// candidates included, and adding it again fills the form again.
  @MainActor
  func testRemovingAndReaddingAPhotoResetsTheVenue() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    app.buttons["Log"].tap()
    let start = app.buttons["Start with a photo"]
    XCTAssertTrue(start.waitForExistence(timeout: 10), app.debugDescription)
    start.tap()
    XCTAssertTrue(app.images.firstMatch.waitForExistence(timeout: 15), app.debugDescription)
    pickPhoto(app, takenInNewYork: "2026-10-03 19:58")
    confirmPhotoCrop(app)

    let filled = button(app, startingWith: "Change Richard Rodgers Theatre")
    let chip = button(app, startingWith: "Richard Rodgers Theatre ·")
    XCTAssertTrue(filled.waitForExistence(timeout: 20) || chip.waitForExistence(timeout: 5))
    // Several theatres in range: the user picks one of the photo's candidates.
    if !filled.exists {
      chip.tap()
      XCTAssertTrue(filled.waitForExistence(timeout: 5))
    }

    app.buttons["Edit crop"].tap()
    let cropBar = app.navigationBars["Crop photo"]
    XCTAssertTrue(cropBar.waitForExistence(timeout: 10))
    cropBar.buttons["Cancel"].tap()
    XCTAssertTrue(filled.exists, "Cancelling a recrop preserves the chosen venue")
    XCTAssertTrue(app.buttons["Remove"].exists, "Cancelling a recrop preserves the photo")

    app.buttons["Remove"].tap()
    XCTAssertFalse(filled.waitForExistence(timeout: 3), "the photo's venue is cleared with the photo")

    app.buttons["Add photo"].tap()
    XCTAssertTrue(app.images.firstMatch.waitForExistence(timeout: 15), app.debugDescription)
    pickPhoto(app, takenInNewYork: "2026-10-03 19:58")
    confirmPhotoCrop(app)
    XCTAssertTrue(filled.waitForExistence(timeout: 20) || chip.waitForExistence(timeout: 5))

    app.buttons["Cancel"].tap()
    app.buttons["Discard"].firstMatch.tap()
  }

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
    confirmPhotoCrop(app)

    // With the web server reachable, OpenStreetMap may find a second
    // theatre in range: then the app offers chips instead of choosing.
    let filled = button(app, startingWith: "Change Richard Rodgers Theatre")
    let chip = button(app, startingWith: "Richard Rodgers Theatre ·")
    XCTAssertTrue(filled.waitForExistence(timeout: 20) || chip.exists)
    XCTAssertTrue(app.buttons["Yesterday"].exists)
    snapshot("photo-filled")

    app.buttons["Cancel"].tap()
    app.buttons["Discard"].firstMatch.tap()
  }
}

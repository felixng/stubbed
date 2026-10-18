import XCTest

final class LogUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// Logs a show with a new show and venue, edits the rating, then deletes it.
  @MainActor
  func testLogEditAndDeleteAShow() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    app.buttons["Log"].tap()
    XCTAssertTrue(app.navigationBars["Track a show"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["Start with a photo"].exists)
    snapshot("log-start")
    app.buttons["No photo? Fill in by hand"].tap()

    let run = Int.random(in: 1000...9999)
    let title = "UI Test Show \(run)"
    let theatre = "UI Test Theatre \(run)"
    XCTAssertTrue(app.buttons["Search shows"].waitForExistence(timeout: 10))
    app.buttons["Search shows"].tap()
    tap(app.searchFields["Search shows"])
    app.searchFields["Search shows"].typeText(title)
    let addShow = button(app, startingWith: "Add “\(title)”")
    XCTAssertTrue(addShow.waitForExistence(timeout: 10))
    addShow.tap()
    XCTAssertTrue(app.staticTexts["New show"].waitForExistence(timeout: 5))

    app.buttons["Search venues"].tap()
    tap(app.searchFields["Search venues"])
    app.searchFields["Search venues"].typeText(theatre)
    let addVenue = button(app, startingWith: "Add “\(theatre)”")
    XCTAssertTrue(addVenue.waitForExistence(timeout: 10))
    addVenue.tap()
    // City and country are prefilled from the last venue used, if any.
    fill(app.textFields["City"], with: "London")
    fill(app.textFields["Country"], with: "United Kingdom")

    XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
    app.collectionViews.firstMatch.swipeUp()
    let rating = app.otherElements["Rating"]
    // The control is the whole form row; the stars start after the row's
    // 20pt inset and are 36pt each, so 81pt into them is 2.5.
    rating.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0.5)).withOffset(CGVector(dx: 20 + 81, dy: 0)).tap()
    snapshot("log-form")

    app.navigationBars.buttons["Save"].tap()
    XCTAssertTrue(app.staticTexts["Saved to your diary. Share it?"].waitForExistence(timeout: 15))
    XCTAssertTrue(app.staticTexts[title].exists)
    snapshot("entry-saved")
    XCTAssertTrue(app.otherElements["Rated 2.5 out of 5"].exists)
    // The city depends on what was prefilled from recent venues.
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Musical · \(theatre), ")).firstMatch.exists)

    app.buttons["Edit"].firstMatch.tap()
    XCTAssertTrue(app.navigationBars["Edit"].buttons["Save"].waitForExistence(timeout: 10))
    app.otherElements["Rating"].swipeRight()  // drag to five stars
    app.navigationBars["Edit"].buttons["Save"].tap()
    XCTAssertTrue(app.otherElements["Rated 5 out of 5"].waitForExistence(timeout: 15))

    app.buttons["Delete"].firstMatch.tap()
    app.sheets.buttons["Delete"].firstMatch.tap()
    XCTAssertFalse(app.staticTexts[title].waitForExistence(timeout: 3))
  }

  /// Types into an empty field, then presses return to close the keyboard.
  @MainActor
  private func fill(_ field: XCUIElement, with text: String) {
    let current = field.value as? String ?? ""
    guard current.isEmpty || current == field.placeholderValue else { return }
    tap(field)
    field.typeText(text + "\n")
  }
}

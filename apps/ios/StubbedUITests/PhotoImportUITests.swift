import XCTest

/// Import by picking photos (#155), with the photos `scripts/dev ui` adds
/// from scripts/fixtures, all taken outside the Richard Rodgers Theatre:
/// curtain-call.jpg and import-interval.jpg on 3 Oct 2026 (one visit),
/// import-stage.jpg on 14 Sep and import-ticket.jpg on 21 Aug.
final class PhotoImportUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testFourPhotosMakeThreeShowsToSaveOrSkip() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    app.buttons["Log"].tap()
    let importButton = app.buttons["Import from photos"]
    XCTAssertTrue(importButton.waitForExistence(timeout: 10), app.debugDescription)
    importButton.tap()

    pickPhoto(app, takenInNewYork: "2026-10-03 19:58")  // curtain-call.jpg
    pickPhoto(app, takenInNewYork: "2026-10-03 21:12")  // import-interval.jpg
    pickPhoto(app, takenInNewYork: "2026-09-14 19:31")  // import-stage.jpg
    pickPhoto(app, takenInNewYork: "2026-08-21 14:05")  // import-ticket.jpg
    snapshot("import-picker")
    app.buttons["Add"].firstMatch.tap()

    XCTAssertTrue(app.staticTexts["3 shows"].waitForExistence(timeout: 20), app.debugDescription)
    XCTAssertTrue(app.staticTexts["Fri 21 Aug 2026"].exists)
    XCTAssertTrue(app.staticTexts["Sat 3 Oct 2026"].exists)
    snapshot("import-found")
    app.navigationBars.buttons["Start"].tap()

    // Oldest first, each form pre-filled from its photo.
    XCTAssertTrue(app.navigationBars["Show 1 of 3"].waitForExistence(timeout: 10))
    let filled = button(app, startingWith: "Change Richard Rodgers Theatre")
    let chip = button(app, startingWith: "Richard Rodgers Theatre ·")
    XCTAssertTrue(filled.waitForExistence(timeout: 20) || chip.exists)
    snapshot("import-show")
    // A tap can land on the outgoing form while the next one slides in
    // (the app ignores it), so tap again until the next show is up.
    // Then wait for the outgoing form to go, so the next tap reaches the
    // new show.
    func skip(from current: String, to next: String) {
      var tries = 0
      repeat {
        app.buttons["Skip this show"].firstMatch.tap()
        tries += 1
      } while !app.navigationBars[next].waitForExistence(timeout: 5) && tries < 3
      XCTAssertTrue(app.navigationBars[next].exists, app.debugDescription)
      let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.navigationBars[current])
      wait(for: [gone], timeout: 5)
    }
    skip(from: "Show 1 of 3", to: "Show 2 of 3")
    skip(from: "Show 2 of 3", to: "Show 3 of 3")

    // The last show: name the show and save it.
    let title = "UI Import Show \(Int.random(in: 1000...9999))"
    app.buttons["Search shows"].tap()
    tap(app.searchFields["Search shows"])
    app.searchFields["Search shows"].typeText(title)
    let addShow = button(app, startingWith: "Add “\(title)”")
    XCTAssertTrue(addShow.waitForExistence(timeout: 10))
    addShow.tap()
    XCTAssertTrue(filled.waitForExistence(timeout: 20) || chip.exists)
    if !filled.exists { chip.tap() }
    XCTAssertTrue(filled.waitForExistence(timeout: 5))
    app.navigationBars["Show 3 of 3"].buttons["Save"].tap()

    XCTAssertTrue(app.staticTexts["1 show logged"].waitForExistence(timeout: 15), app.debugDescription)
    XCTAssertTrue(app.staticTexts["You skipped 2 shows."].exists)
    snapshot("import-finished")
    app.navigationBars.buttons["Done"].tap()

    // The diary on the Profile tab has the new show (diary rows are buttons).
    // The diary only creates rows as they scroll into view.
    let row = button(app, startingWith: title)
    var swipes = 0
    while !row.waitForExistence(timeout: swipes == 0 ? 3 : 1), swipes < 8 {
      app.collectionViews.firstMatch.swipeUp()
      swipes += 1
    }
    snapshot("import-diary")
    XCTAssertTrue(row.exists, app.debugDescription)
  }
}

import XCTest

/// The import callout (#194): Home and Profile offer import until the first
/// show is logged. The new test user has no shows; `ios_test` has a diary.
final class ImportCalloutUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  private let heading = "Bring in the shows you’ve seen"

  @MainActor
  func testNewUserIsOfferedImportOnHomeAndProfile() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app, newUser: true)
    finishOnboardingIfNeeded(app)

    XCTAssertTrue(app.staticTexts[heading].waitForExistence(timeout: 15), app.debugDescription)
    XCTAssertFalse(app.staticTexts["Nothing here yet"].exists)
    snapshot("callout-home")

    // Picking photos from Home goes straight into the import.
    app.buttons["Import from photos"].tap()
    pickPhoto(app, takenInNewYork: "2026-09-14 19:31")  // import-stage.jpg
    app.buttons["Add"].firstMatch.tap()
    XCTAssertTrue(app.navigationBars["Import from photos"].waitForExistence(timeout: 20), app.debugDescription)
    app.navigationBars.buttons["Cancel"].tap()

    openTab("Profile", in: app)
    // Profile's native List creates the callout below its year summary.
    for _ in 0..<8 where !app.staticTexts[heading].exists { app.collectionViews.firstMatch.swipeUp() }
    XCTAssertTrue(app.staticTexts[heading].waitForExistence(timeout: 10), app.debugDescription)
    for _ in 0..<4 where !app.buttons["Log a show"].exists { app.collectionViews.firstMatch.swipeUp() }
    XCTAssertTrue(app.buttons["Log a show"].exists)
    snapshot("callout-profile")
  }

  @MainActor
  func testNoCalloutOnceShowsAreLogged() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Hamilton")).firstMatch
      .waitForExistence(timeout: 15))
    XCTAssertFalse(app.staticTexts[heading].exists)

    openTab("Profile", in: app)
    XCTAssertTrue(app.staticTexts["@ios_test"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.staticTexts[heading].exists)

    // Instead, import sits at the foot of the diary (#195)…
    let row = app.buttons["Import from photos"]
    for _ in 0..<6 where !row.isHittable { app.collectionViews.firstMatch.swipeUp() }
    snapshot("profile-import-row")
    row.tap()
    pickPhoto(app, takenInNewYork: "2026-09-14 19:31")  // import-stage.jpg
    app.buttons["Add"].firstMatch.tap()
    XCTAssertTrue(app.navigationBars["Import from photos"].waitForExistence(timeout: 20), app.debugDescription)
    app.navigationBars.buttons["Cancel"].tap()

    // …and in Settings.
    app.navigationBars.buttons["Settings"].tap()
    app.buttons["Import from photos"].firstMatch.tap()
    pickPhoto(app, takenInNewYork: "2026-09-14 19:31")
    app.buttons["Add"].firstMatch.tap()
    XCTAssertTrue(app.navigationBars["Import from photos"].waitForExistence(timeout: 20), app.debugDescription)
    app.navigationBars.buttons["Cancel"].tap()
  }

  /// The new user is recreated without a handle each run; another class
  /// may already have set one up.
  @MainActor
  private func finishOnboardingIfNeeded(_ app: XCUIApplication) {
    guard app.staticTexts["Set up your profile"].waitForExistence(timeout: 15) else { return }
    let name = app.textFields["Name"]
    scrollAndTap(name, in: app)
    name.typeText("iOS New")
    let handle = app.textFields["Handle"]
    scrollAndTap(handle, in: app)
    handle.typeText("ios_new")
    XCTAssertTrue(app.staticTexts["@ios_new is yours."].waitForExistence(timeout: 10))
    app.buttons["Continue"].tap()
    XCTAssertTrue(app.buttons["Profile"].waitForExistence(timeout: 15))
  }
}

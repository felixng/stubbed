import XCTest

final class SettingsUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  private func editProfile(newUser: Bool = false) throws -> XCUIApplication {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app, newUser: newUser)
    if newUser {
      XCTAssertTrue(app.staticTexts["Set up your profile"].waitForExistence(timeout: 15))
      tap(app.textFields["Name"])
      app.textFields["Name"].typeText("Leaving Soon")
      tap(app.textFields["Handle"])
      app.textFields["Handle"].typeText("ios_new")
      XCTAssertTrue(app.staticTexts["@ios_new is yours."].waitForExistence(timeout: 10))
      app.scrollViews.firstMatch.swipeUp()
      app.buttons["Continue"].tap()
    }
    XCTAssertTrue(onHome(app))
    app.buttons["Profile"].tap()
    let edit = app.buttons["Edit profile"].firstMatch
    XCTAssertTrue(edit.waitForExistence(timeout: 10))
    edit.tap()
    XCTAssertTrue(app.navigationBars["Edit profile"].waitForExistence(timeout: 10))
    return app
  }

  @MainActor
  func testGoPrivateAndBack() throws {
    let app = try editProfile()
    let row = app.switches.matching(NSPredicate(format: "label BEGINSWITH %@", "Private profile")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 10))
    app.scrollViews.firstMatch.swipeUp()
    // The switch sits at the row's trailing edge.
    let toggle = row.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5))
    toggle.tap()
    XCTAssertEqual(row.value as? String, "1")
    scrollAndTap(app.buttons["Save"], in: app)
    XCTAssertTrue(app.staticTexts["Saved. Your profile is private."].waitForExistence(timeout: 10))
    snapshot("settings-private")

    toggle.tap()
    scrollAndTap(app.buttons["Save"], in: app)
    XCTAssertTrue(app.staticTexts["Saved. Your profile is public."].waitForExistence(timeout: 10))
  }

  @MainActor
  func testDeleteAccountNeedsTheHandleThenSignsOut() throws {
    let app = try editProfile(newUser: true)
    scrollAndTap(app.buttons["Delete account"], in: app)
    let confirm = app.textFields.matching(NSPredicate(format: "label BEGINSWITH %@", "Type your handle")).firstMatch
    XCTAssertTrue(confirm.waitForExistence(timeout: 10))
    let delete = app.buttons["confirm-delete-account"]
    XCTAssertFalse(delete.isEnabled, "Disabled until the handle matches")
    tap(confirm)
    confirm.typeText("ios_new")
    snapshot("delete-account")
    delete.tap()
    XCTAssertTrue(app.staticTexts["Your account and everything in it have been deleted."].waitForExistence(timeout: 20))
    snapshot("deleted")
  }
}

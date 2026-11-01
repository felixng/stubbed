import XCTest

final class SettingsUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  private func openSettings(newUser: Bool = false) throws -> XCUIApplication {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app, newUser: newUser)
    if newUser {
      XCTAssertTrue(app.staticTexts["Set up your profile"].waitForExistence(timeout: 15))
      scrollAndTap(app.textFields["Name"], in: app)
      app.textFields["Name"].typeText("Leaving Soon\n")
      app.textFields["Handle"].typeText("ios_new")
      XCTAssertTrue(app.staticTexts["@ios_new is yours."].waitForExistence(timeout: 10))
      app.buttons["Continue"].tap()
    }
    XCTAssertTrue(onHome(app))
    openTab("Profile", in: app)
    app.buttons["Settings"].tap()
    XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 10))
    return app
  }

  @MainActor
  func testSettingsHubAndProfileCardEditor() throws {
    let app = try openSettings()
    XCTAssertTrue(app.buttons["Edit profile"].exists)
    XCTAssertTrue(app.buttons["View public profile"].exists)
    XCTAssertTrue(app.buttons["Profile privacy"].exists)
    XCTAssertTrue(app.buttons["Blocked accounts"].exists)
    XCTAssertTrue(app.buttons["Import from photos"].exists)
    XCTAssertTrue(app.buttons["Notifications"].exists)
    snapshot("settings-hub")
    app.buttons["Edit profile"].tap()
    XCTAssertTrue(app.navigationBars["Edit profile"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.textFields["Handle"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.switches["Private profile"].exists)
    snapshot("edit-profile")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.buttons["Edit profile"].waitForExistence(timeout: 10))
    snapshot("profile-settings-actions")
    app.buttons["Edit profile"].tap()
    XCTAssertTrue(app.navigationBars["Edit profile"].waitForExistence(timeout: 10))

    // Keep the session, but relaunch with the largest accessibility text.
    // This also checks that the pencil remains reachable on the profile card.
    app.terminate()
    app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
    app.launch()
    XCTAssertTrue(onHome(app))
    openTab("Profile", in: app)
    snapshot("profile-settings-accessibility")
    XCTAssertTrue(app.buttons["Edit profile"].isHittable)
    app.buttons["Settings"].tap()
    XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 10))
    snapshot("settings-accessibility")
    scrollAndTap(app.buttons["Edit profile"], in: app)
    XCTAssertTrue(app.navigationBars["Edit profile"].waitForExistence(timeout: 10))
    snapshot("edit-profile-accessibility")
  }

  @MainActor
  func testGoPrivateAndBack() throws {
    let app = try openSettings()
    app.buttons["Profile privacy"].tap()
    let row = app.switches.matching(NSPredicate(format: "label BEGINSWITH %@", "Private profile")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 10))
    XCTAssertEqual(row.value as? String, "0")
    row.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
    expectation(for: NSPredicate(format: "value == %@", "1"), evaluatedWith: row)
    waitForExpectations(timeout: 10)
    scrollAndTap(app.buttons["Save"], in: app)
    XCTAssertTrue(app.staticTexts["Saved. Your profile is private."].waitForExistence(timeout: 10))
    snapshot("settings-private")

    row.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
    expectation(for: NSPredicate(format: "value == %@", "0"), evaluatedWith: row)
    waitForExpectations(timeout: 10)
    scrollAndTap(app.buttons["Save"], in: app)
    XCTAssertTrue(app.staticTexts["Saved. Your profile is public."].waitForExistence(timeout: 10))
  }

  @MainActor
  func testDeleteAccountNeedsTheHandleThenSignsOut() throws {
    let app = try openSettings(newUser: true)
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

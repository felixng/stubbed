import XCTest

/// Signs in as the new test user, which `scripts/dev ui` recreates without
/// a handle before every run.
final class WelcomeUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testOnboardingChecksTheHandleThenOpensTheApp() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app, newUser: true)

    XCTAssertTrue(app.staticTexts["Set up your profile"].waitForExistence(timeout: 15))
    let name = app.textFields["Name"]
    scrollAndTap(name, in: app)
    name.typeText("iOS Test")

    let handle = app.textFields["Handle"]
    scrollAndTap(handle, in: app)
    handle.typeText("Admin")
    XCTAssertTrue(app.staticTexts["That handle is reserved. Try another."].waitForExistence(timeout: 10))
    snapshot("welcome-reserved")

    handle.typeText(XCUIKeyboardKey.delete.rawValue.repeated(5) + "ios_new")
    XCTAssertTrue(app.staticTexts["@ios_new is yours."].waitForExistence(timeout: 10))
    snapshot("welcome-available")

    // Continue stays reachable in the native navigation bar above the keyboard.
    app.buttons["Continue"].tap()
    XCTAssertTrue(app.buttons["Profile"].waitForExistence(timeout: 15))
  }
}

private extension String {
  func repeated(_ count: Int) -> String { String(repeating: self, count: count) }
}

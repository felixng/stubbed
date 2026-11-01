import XCTest

final class WelcomeAccessibilityUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor func testOnboardingAtLargestTextSize() throws {
    let app = XCUIApplication()
    app.launchArguments = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
    app.launch()
    signOutIfNeeded(app)
    try signIn(app, newUser: true)
    XCTAssertTrue(app.navigationBars["Welcome"].waitForExistence(timeout: 15))
    snapshot("welcome-accessibility")
    scrollAndTap(app.textFields["Name"], in: app)
    app.textFields["Name"].typeText("iOS New\n")
    let handle = app.textFields["Handle"]
    handle.typeText("ios_new")
    XCTAssertTrue(app.staticTexts["@ios_new is yours."].waitForExistence(timeout: 10))
    snapshot("welcome-accessibility-fields")
    XCTAssertTrue(app.buttons["Continue"].isHittable)
    app.buttons["Continue"].tap()
    XCTAssertTrue(onHome(app))
  }
}

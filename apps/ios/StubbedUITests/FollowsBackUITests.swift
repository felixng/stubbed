import XCTest

/// Followers and Following on the Profile tab open once, so one back
/// returns to Profile (a NavigationLink in the selectable List pushed them
/// twice).
final class FollowsBackUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testOneBackReturnsToProfile() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    app.buttons["Profile"].tap()
    XCTAssertTrue(app.staticTexts["@ios_test"].waitForExistence(timeout: 10))
    snapshot("profile-follows-rows")

    for list in ["Followers", "Following"] {
      app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", list)).firstMatch.tap()
      let bar = app.navigationBars[list]
      XCTAssertTrue(bar.waitForExistence(timeout: 10))
      bar.buttons.firstMatch.tap()
      XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 5), "one back should return to Profile from \(list)")
      XCTAssertFalse(bar.exists)
    }

    // The follow request's row opens @ios_fan's profile, once.
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "@ios_fan")).firstMatch.tap()
    XCTAssertTrue(app.staticTexts["A Fan"].waitForExistence(timeout: 10))
    app.navigationBars.firstMatch.buttons.firstMatch.tap()
    XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 5), "one back should return to Profile from @ios_fan")
  }
}

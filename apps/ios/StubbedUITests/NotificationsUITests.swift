import XCTest

final class NotificationsUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testNotificationNavigation() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    snapshot("notifications-home")
    app.buttons["notifications-bell"].tap()
    XCTAssertTrue(app.navigationBars["Notifications"].waitForExistence(timeout: 10))
    snapshot("notifications-inbox")
    app.buttons["Notification actions"].tap()
    app.buttons["Notification settings"].tap()
    XCTAssertTrue(app.navigationBars["Notification settings"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.switches["Mobile push"].waitForExistence(timeout: 10))
    expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: app.switches["Mobile push"])
    waitForExpectations(timeout: 10)
    snapshot("notifications-settings")
    app.swipeUp()
    snapshot("notifications-settings-categories")
  }
}

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
    app.buttons["Notifications"].tap()
    XCTAssertTrue(app.navigationBars["Notifications"].waitForExistence(timeout: 10))
    snapshot("notifications-inbox")
    app.buttons["Notification settings"].tap()
    XCTAssertTrue(app.navigationBars["Notification settings"].waitForExistence(timeout: 10))
    snapshot("notifications-settings")
  }
}

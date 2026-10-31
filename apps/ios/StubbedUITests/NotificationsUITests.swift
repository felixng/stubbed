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
    let comment = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "commented on your")).firstMatch
    XCTAssertTrue(comment.waitForExistence(timeout: 10))
    comment.tap()
    XCTAssertTrue(app.navigationBars["Hamilton"].waitForExistence(timeout: 10))
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.navigationBars["Notifications"].waitForExistence(timeout: 10))
    app.buttons["Notification actions"].tap()
    app.buttons["Notification settings"].tap()
    XCTAssertTrue(app.navigationBars["Notification settings"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.switches["Mobile push"].waitForExistence(timeout: 10))
    expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: app.switches["Mobile push"])
    waitForExpectations(timeout: 10)
    snapshot("notifications-settings")
    app.swipeUp()
    snapshot("notifications-settings-categories")
    app.terminate()
    app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
    app.launch()
    XCTAssertTrue(onHome(app))
    app.buttons["notifications-bell"].tap()
    XCTAssertTrue(app.navigationBars["Notifications"].waitForExistence(timeout: 10))
    snapshot("notifications-accessibility")
    app.buttons["Notification actions"].tap()
    app.buttons["Notification settings"].tap()
    XCTAssertTrue(app.navigationBars["Notification settings"].waitForExistence(timeout: 10))
    snapshot("notification-settings-accessibility")
    app.swipeUp()
    snapshot("notification-permission-accessibility")
  }
}

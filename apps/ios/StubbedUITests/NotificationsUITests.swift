import XCTest

final class NotificationsUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testNotificationNavigation() throws {
    let app = XCUIApplication()
    app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryM"]
    app.launch()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    snapshot("notifications-home")
    app.buttons["notifications-bell"].tap()
    XCTAssertTrue(app.navigationBars["Notifications"].waitForExistence(timeout: 10))
    snapshot("notifications-inbox")
    let comment = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "commented on your")).firstMatch
    XCTAssertTrue(comment.waitForExistence(timeout: 10))
    comment.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4)).tap()
    XCTAssertTrue(app.navigationBars["Hamilton"].waitForExistence(timeout: 10))
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.navigationBars["Notifications"].waitForExistence(timeout: 10))
    app.buttons["Notification actions"].tap()
    app.buttons["Notification settings"].tap()
    XCTAssertTrue(app.navigationBars["Notification settings"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.switches["Likes on your shows"].waitForExistence(timeout: 10))
    expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: app.switches["Likes on your shows"])
    waitForExpectations(timeout: 10)
    XCTAssertFalse(app.switches["Mobile push"].exists)
    XCTAssertFalse(app.switches["Show notification previews"].exists)
    XCTAssertFalse(app.switches["Quiet hours"].exists)
    XCTAssertFalse(app.staticTexts["In-app"].exists)
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

  @MainActor
  func testPermissionInvitationDisappearsWhenAllowed() throws {
    let app = XCUIApplication()
    app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryM"]
    app.launch()
    if !onHome(app) { signOutIfNeeded(app); try signIn(app); XCTAssertTrue(onHome(app)) }
    app.buttons["notifications-bell"].tap()
    XCTAssertTrue(app.navigationBars["Notifications"].waitForExistence(timeout: 10))
    let enable = app.buttons["Enable notifications"]
    if enable.waitForExistence(timeout: 3) {
      snapshot("notification-permission-invitation")
      enable.tap()
      let allow = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Allow"]
      XCTAssertTrue(allow.waitForExistence(timeout: 10))
      allow.tap()
    } else if app.buttons["Open iPhone Settings"].exists {
      snapshot("notification-permission-denied")
      throw XCTSkip("Permission was previously denied on this simulator; reset the installation before testing Allow")
    }
    expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.descendants(matching: .any).matching(identifier: "notification-permission-callout").firstMatch)
    waitForExpectations(timeout: 15)
    snapshot("notifications-permission-allowed")
    app.buttons["Notification actions"].tap()
    app.buttons["Notification settings"].tap()
    XCTAssertTrue(app.switches["Likes on your shows"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.buttons["Enable notifications"].exists)
    XCTAssertFalse(app.staticTexts["Permission"].exists)
    snapshot("notifications-settings-allowed")
  }

}

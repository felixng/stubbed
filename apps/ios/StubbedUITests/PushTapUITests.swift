import XCTest

/// Run with scripts/test-push-tap: simctl supplies a real system notification,
/// so this exercises the Objective-C delegate entry point, not just the router.
final class PushTapUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testLikePushTapFromTerminatedApp() throws {
    try openLikePush(terminated: true)
  }

  @MainActor
  func testLikePushTapFromBackgroundApp() throws {
    try openLikePush(terminated: false)
  }

  @MainActor
  private func openLikePush(terminated: Bool) throws {
    guard let title = env["STUBBED_PUSH_TITLE"] else {
      throw XCTSkip("Run scripts/test-push-tap to inject the simulator notification")
    }
    let app = XCUIApplication()
    app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryM"]
    app.launch()
    allowNotificationsIfPresented()
    if !onHome(app) { signOutIfNeeded(app); try signIn(app); XCTAssertTrue(onHome(app)) }
    for _ in 0..<3 {
      if app.navigationBars["Notifications"].exists { break }
      app.buttons["notifications-bell"].tap()
      if app.navigationBars["Notifications"].waitForExistence(timeout: 3) { break }
    }
    XCTAssertTrue(app.navigationBars["Notifications"].waitForExistence(timeout: 10))
    if app.buttons["Enable notifications"].waitForExistence(timeout: 3) {
      app.buttons["Enable notifications"].tap()
      let allow = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Allow"]
      XCTAssertTrue(allow.waitForExistence(timeout: 10))
      allowNotificationsIfPresented()
      expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.buttons["Enable notifications"])
      waitForExpectations(timeout: 15)
    }
    XCTAssertFalse(app.buttons["Open iPhone Settings"].exists, "Use a simulator with notifications allowed")
    if terminated { app.terminate() } else { XCUIDevice.shared.press(.home) }
    snapshot(terminated ? "push-tap-ready-cold" : "push-tap-ready-background")
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let notification = springboard.descendants(matching: .any)
      .matching(NSPredicate(format: "label CONTAINS %@", title)).firstMatch
    XCTAssertTrue(notification.waitForExistence(timeout: 60), springboard.debugDescription)
    notification.tap()
    XCTAssertTrue(app.wait(for: .runningForeground, timeout: 15))
    XCTAssertTrue(app.navigationBars["Show"].waitForExistence(timeout: 20), app.debugDescription)
    XCTAssertTrue(app.staticTexts["Hamilton"].firstMatch.exists, "The like must open its exact diary entry")
    XCTAssertTrue(app.staticTexts["Lin's replacement was brilliant. Front mezz, row B."].exists,
                  "Open the liked visit, even when several entries have the same show title")
    snapshot(terminated ? "push-tap-cold-entry" : "push-tap-background-entry")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.navigationBars[terminated ? "Home" : "Notifications"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.staticTexts["Opening activity…"].exists, "Back must not reopen the resolver")
  }

  @MainActor
  private func allowNotificationsIfPresented() {
    let allow = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Allow"]
    // A tap while the system prompt animates can be ignored on a small phone.
    for _ in 0..<3 {
      if !allow.waitForExistence(timeout: 1) { break }
      allow.tap()
    }
  }
}

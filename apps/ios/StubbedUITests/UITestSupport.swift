import XCTest

/// Shared steps for UI tests. `scripts/dev ui` passes the local test user
/// and a folder for screenshots through the environment.
extension XCTestCase {
  var env: [String: String] { ProcessInfo.processInfo.environment }

  @MainActor
  func launchApp() -> XCUIApplication {
    let app = XCUIApplication()
    app.launch()
    return app
  }

  /// Starts from the sign-in screen, signing out first if a session is left
  /// over from an earlier run.
  @MainActor
  func signOutIfNeeded(_ app: XCUIApplication) {
    let profileTab = app.buttons["Profile"]
    if profileTab.waitForExistence(timeout: 5) {
      profileTab.tap()
      app.buttons["Account"].tap()
      app.buttons["Sign out"].tap()
    } else if app.buttons["Sign out"].exists {
      app.buttons["Sign out"].tap()
    }
    XCTAssertTrue(app.textFields["Email"].waitForExistence(timeout: 10))
  }

  @MainActor
  /// Signs in as the test user with a handle, or (`newUser`) the one that
  /// hasn't set up a profile yet.
  func signIn(_ app: XCUIApplication, newUser: Bool = false) throws {
    let email = try XCTUnwrap(env[newUser ? "STUBBED_NEW_EMAIL" : "STUBBED_EMAIL"], "Run through scripts/dev ui")
    let password = try XCTUnwrap(env["STUBBED_PASSWORD"])
    let field = app.textFields["Email"]
    field.tap()
    field.typeText(email)
    let secure = app.secureTextFields["Password"]
    secure.tap()
    secure.typeText(password)
    app.buttons["Sign in"].firstMatch.tap()
    dismissSavePassword(app)
  }

  /// iOS offers to save the password after a sign-in, sometimes a few
  /// seconds later; say "Not Now".
  @MainActor
  func dismissSavePassword(_ app: XCUIApplication) {
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let deadline = Date().addingTimeInterval(8)
    var tapped = false
    while Date() < deadline {
      let shown = [app, springboard].map { $0.buttons["Not Now"] }.first { $0.exists }
      if let shown {
        // A tap while it's still animating in can be ignored: tap again.
        shown.tap()
        tapped = true
        usleep(800_000)
      } else if tapped {
        return
      } else {
        usleep(250_000)
      }
    }
  }

  /// Taps a text field once it's on screen. SwiftUI fields with padding
  /// around them can report "not hittable" while they take taps fine, so
  /// this taps the element's centre. Buttons use plain `tap()`, which
  /// scrolls them out from under the keyboard first.
  @MainActor
  func tap(_ element: XCUIElement, timeout: TimeInterval = 10) {
    XCTAssertTrue(element.waitForExistence(timeout: timeout), "\(element) never appeared")
    element.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
  }

  /// A button whose label starts with `prefix` (rows with a second line read
  /// as "Title, Subtitle").
  @MainActor
  func button(_ app: XCUIApplication, startingWith prefix: String) -> XCUIElement {
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", prefix)).firstMatch
  }

  /// Scrolls until the element can take a tap (it isn't under the tab bar
  /// or the keyboard), then taps it.
  @MainActor
  func scrollAndTap(_ element: XCUIElement, in app: XCUIApplication) {
    // Forms (collection views) only create rows as they scroll into view.
    func scroller() -> XCUIElement {
      app.collectionViews.firstMatch.exists ? app.collectionViews.firstMatch : app.scrollViews.firstMatch
    }
    var searched = 0
    while !element.waitForExistence(timeout: searched == 0 ? 3 : 1), searched < 6 {
      scroller().swipeUp()
      searched += 1
    }
    XCTAssertTrue(element.waitForExistence(timeout: 10), "\(element) never appeared")
    // isHittable doesn't notice the raised Log button, so compare frames.
    let bar = app.buttons["Log"]
    func covered() -> Bool {
      !element.isHittable || (bar.exists && element.frame.maxY > bar.frame.minY - 4)
    }
    var tries = 0
    while covered(), tries < 6 {
      scroller().swipeUp(velocity: .slow)
      tries += 1
    }
    element.tap()
  }

  /// Waits for the Home tab after sign-in, saving a screenshot if it never
  /// shows.
  @MainActor
  @discardableResult
  func onHome(_ app: XCUIApplication, timeout: TimeInterval = 15) -> Bool {
    let shown = app.navigationBars["Home"].waitForExistence(timeout: timeout)
    if !shown { snapshot("not-home") }
    return shown
  }

  /// Saves the screen as build/ui/<name>.png.
  @MainActor
  func snapshot(_ name: String) {
    let png = XCUIScreen.main.screenshot().pngRepresentation
    if let dir = env["STUBBED_SCREENSHOTS"] {
      try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
    }
    let attachment = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }
}

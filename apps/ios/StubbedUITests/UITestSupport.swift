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
    let profileTab = tabButton("Profile", in: app)
    if profileTab.waitForExistence(timeout: 5) {
      profileTab.tap()
      // A previous test can leave the Profile navigation stack in Insights
      // or an entry. Switching tabs preserves that stack, so pop to its root.
      for _ in 0..<6 {
        if app.buttons["Settings"].waitForExistence(timeout: 1) { break }
        if app.navigationBars["Home"].exists {
          // A tab tap during launch can be ignored while the bar animates.
          profileTab.tap()
        } else {
          let back = app.navigationBars.buttons.element(boundBy: 0)
          guard back.exists else { break }
          back.tap()
        }
      }
      app.buttons["Settings"].tap()
      scrollAndTap(app.buttons["Sign out"], in: app)
      // Navigation presentation can finish after XCTest reports the app idle.
      for _ in 0..<3 {
        if app.textFields["Email"].waitForExistence(timeout: 2) { break }
        if app.buttons["Sign out"].exists { app.buttons["Sign out"].tap() }
      }
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
    tap(field)
    // Simulator focus can lag the first coordinate tap after sign-out.
    if !app.keyboards.firstMatch.waitForExistence(timeout: 3) { tap(field) }
    // Use the form's native Next/Go actions: the password field and Sign in
    // button can sit behind the keyboard on a small phone.
    field.typeText(email + "\n")
    let secure = app.secureTextFields["Password"]
    secure.typeText(password + "\n")
    dismissSavePassword(app)
  }

  /// iOS offers to save the password after a sign-in, sometimes a few
  /// seconds later; say "Not Now".
  @MainActor
  func dismissSavePassword(_ app: XCUIApplication, within seconds: TimeInterval = 8) {
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let deadline = Date().addingTimeInterval(seconds)
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

  /// Picks a fixture photo in the system photo picker. The picker labels
  /// photos by when they were taken, in the Simulator's time zone; the
  /// fixtures' EXIF has no offset, so Photos reads their times in the zone
  /// of their GPS (New York). Working the label out the same way keeps the
  /// tests passing on any Mac. The grid reports cells as not hittable, so
  /// this taps their centres.
  @MainActor
  func pickPhoto(_ app: XCUIApplication, takenInNewYork time: String) {
    let taken = DateFormatter()
    taken.timeZone = TimeZone(identifier: "America/New_York")
    taken.dateFormat = "yyyy-MM-dd HH:mm"
    let shown = DateFormatter()
    shown.locale = Locale(identifier: "en_US_POSIX")
    shown.timeZone = .current
    shown.dateFormat = "dd|MMMM|HH:mm"
    let parts = shown.string(from: taken.date(from: time)!).split(separator: "|").map(String.init)
    let cell = app.images.matching(NSPredicate(
      format: "label CONTAINS %@ AND label CONTAINS %@ AND label CONTAINS %@", parts[0], parts[1], parts[2])).firstMatch
    XCTAssertTrue(cell.waitForExistence(timeout: 15), app.debugDescription)
    // The library can retain fixtures from earlier runs. Bring the cell's
    // centre above the picker's bottom toolbar before using a coordinate tap.
    for _ in 0..<8 {
      let centre = cell.frame.midY
      if centre > 200, centre < app.frame.maxY - 110 { break }
      let lower = app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.75))
      let upper = app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.45))
      if centre >= app.frame.maxY - 110 { lower.press(forDuration: 0.05, thenDragTo: upper) }
      else { upper.press(forDuration: 0.05, thenDragTo: lower) }
    }
    cell.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
  }

  @MainActor
  func confirmPhotoCrop(_ app: XCUIApplication) {
    let accept = app.navigationBars["Crop photo"].buttons["Use photo"]
    XCTAssertTrue(accept.waitForExistence(timeout: 15), app.debugDescription)
    accept.tap()
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

  /// Keep coordinate gestures inside the content viewport. On older iOS,
  /// isHittable can be true while a control's centre is under system chrome.
  @MainActor
  func revealControl(_ element: XCUIElement, in app: XCUIApplication) {
    let list = app.collectionViews.firstMatch
    for _ in 0..<24 {
      if !element.exists {
        let from = list.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.75))
        from.press(forDuration: 0.05, thenDragTo: list.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.55)),
          withVelocity: .slow, thenHoldForDuration: 0.3)
        continue
      }
      let top = app.navigationBars.firstMatch.frame.maxY + 16
      let bottom = app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY - 16 : app.frame.maxY - 24
      let frame = element.frame
      if frame.minY >= top, frame.maxY <= bottom { return }
      let delta = (top + bottom) / 2 - frame.midY
      let limit = app.frame.height * 0.3
      let from = list.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5))
      from.press(forDuration: 0.05, thenDragTo: from.withOffset(CGVector(dx: 0, dy: min(limit, max(-limit, delta)))),
        withVelocity: .slow, thenHoldForDuration: 0.3)
    }
    XCTAssertTrue(element.isHittable)
  }

  /// Waits for the Home tab after sign-in, saving a screenshot if it never
  /// shows.
  @MainActor
  @discardableResult
  func onHome(_ app: XCUIApplication, timeout: TimeInterval = 15) -> Bool {
    let shown = app.navigationBars["Home"].waitForExistence(timeout: timeout)
    if !shown { snapshot("not-home") }
    // The Save Password prompt sometimes arrives after sign-in's own check,
    // over the feed. Catch a late one before the test starts tapping.
    if shown { dismissSavePassword(app, within: 3) }
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

/// Taps a tab and waits for its screen. Straight after onboarding the tab
/// bar can still be animating in and miss the first tap, so it tries twice.
@MainActor
func tabButton(_ name: String, in app: XCUIApplication) -> XCUIElement {
  let symbol = ["Home": "house", "Log": "plus.circle.fill", "Profile": "person.crop.circle"][name] ?? name
  // iOS can expose a non-hittable symbol element as well as the labelled
  // tab. Prefer the actual tab control, including on the floating tab bar.
  let candidates = [app.tabBars.buttons[name].firstMatch, app.buttons[name].firstMatch, app.buttons[symbol].firstMatch]
  return candidates.first(where: { $0.exists && $0.isHittable }) ?? app.buttons[symbol].firstMatch
}

@MainActor
func openTab(_ name: String, in app: XCUIApplication) {
  for _ in 0..<2 {
    tabButton(name, in: app).tap()
    if app.navigationBars[name].waitForExistence(timeout: 3) { return }
  }
  XCTFail("The \(name) tab didn't open")
}

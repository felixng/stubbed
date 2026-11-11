import XCTest

/// Every locked state, with the DEBUG-only `-paywallPreview free` argument faking gates, sales
/// and a Free membership against the local database (which has them off).
final class PaywallPreviewUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  private func launchFree(offer: String? = nil, largeText: Bool = false, mode: String = "free") throws -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments += ["-paywallPreview", mode]
    if let offer { app.launchArguments += ["-paywallOffer", offer] }
    if largeText { app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"] }
    app.launch()
    if app.buttons["Profile"].waitForExistence(timeout: 5) { openTab("Profile", in: app) }
    if !app.staticTexts["@ios_test"].waitForExistence(timeout: 3) {
      signOutIfNeeded(app)
      try signIn(app)
      XCTAssertTrue(onHome(app))
      openTab("Profile", in: app)
    }
    return app
  }

  /// Membership lives in Settings: a member manages it there, a Free user upgrades from there.
  @MainActor
  func testSettingsShowsMembership() throws {
    let pro = try launchFree(mode: "pro")
    pro.navigationBars.buttons["Settings"].tap()
    XCTAssertTrue(pro.descendants(matching: .any)["settings-membership"].waitForExistence(timeout: 5), pro.debugDescription)
    XCTAssertTrue(pro.buttons["manage-membership"].exists)
    XCTAssertFalse(pro.descendants(matching: .any)["profile-pro-member"].exists)
    snapshot("settings-membership-pro")
    pro.terminate()

    let free = try launchFree()
    free.navigationBars.buttons["Settings"].tap()
    XCTAssertTrue(free.buttons["settings-upgrade"].waitForExistence(timeout: 5), free.debugDescription)
    snapshot("settings-membership-free")
    free.buttons["settings-upgrade"].tap()
    XCTAssertTrue(free.otherElements["paywall"].waitForExistence(timeout: 5))
  }

  @MainActor
  func testLockedStatesOpenTheOnePaywall() throws {
    let app = try launchFree()

    // Profile callout.
    let banner = app.otherElements["pro-banner"]
    scrollAndTap(app.buttons["profile-insights"], in: app)
    app.navigationBars.buttons.element(boundBy: 0).tap()
    reveal(banner, in: app)
    snapshot("paywall-profile-callout")
    app.buttons["pro-banner-upgrade"].tap()
    XCTAssertTrue(app.otherElements["paywall"].waitForExistence(timeout: 5)
      || app.staticTexts["paywall-unavailable"].waitForExistence(timeout: 5))
    snapshot("paywall-sheet")
    app.buttons["Close"].tap()

    // Insights: Show mix locked in place.
    scrollAndTap(app.buttons["profile-insights"], in: app)
    XCTAssertTrue(app.navigationBars["Insights"].waitForExistence(timeout: 10))
    reveal(app.buttons["insights-share-mix"], in: app)
    snapshot("paywall-insights-show-mix-locked")

    // A locked period opens the paywall and stays on this year.
    for _ in 0..<6 { app.collectionViews.firstMatch.swipeDown() }
    app.buttons["insights-year"].tap()
    // The period sheet lists this year, then Earlier years and All time marked as Pro.
    XCTAssertTrue(app.buttons["period-earlier"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["period-all"].exists)
    snapshot("paywall-period-sheet")
    app.buttons["All time"].tap()
    XCTAssertTrue(app.staticTexts["paywall-unavailable"].waitForExistence(timeout: 5))
    snapshot("paywall-period-locked")
    app.buttons["Close"].tap()
    // The paywall opened over the period sheet, so closing it leaves the sheet; close that too.
    app.buttons["period-close"].tap()

    // A locked card: the share sheet opens on the Show mix card.
    reveal(app.buttons["insights-share-mix"], in: app)
    app.buttons["insights-share-mix"].tap()
    let card = app.descendants(matching: .any)["share-card-locked-show-mix"]
    let found = card.waitForExistence(timeout: 20)
    snapshot("paywall-card-locked")
    XCTAssertTrue(found)
    XCTAssertFalse(app.buttons["Download"].isEnabled)
  }

  /// The paywall with a mocked store offering (DEBUG-only `-paywallOffer`): trial-eligible and
  /// not, the Confirming… state, the timeout state, and the largest Dynamic Type.
  @MainActor
  private func openPaywall(offer: String, largeText: Bool = false) throws -> XCUIApplication {
    let app = try launchFree(offer: offer, largeText: largeText)
    reveal(app.otherElements["pro-banner"], in: app)
    app.buttons["pro-banner-upgrade"].tap()
    XCTAssertTrue(app.otherElements["paywall"].waitForExistence(timeout: 5))
    return app
  }

  @MainActor func testPaywallOfferTrialEligible() throws {
    let app = try openPaywall(offer: "eligible")
    XCTAssertTrue(app.buttons["Start free trial"].waitForExistence(timeout: 5))
    snapshot("paywall-offer-trial")
    reveal(app.buttons["paywall-restore"], in: app)
    XCTAssertTrue(app.buttons["paywall-restore"].exists)
    // App Review's subscription requirements: renewal terms and the two legal links.
    reveal(app.buttons["paywall-privacy"], in: app)
    XCTAssertTrue(app.buttons["paywall-terms"].exists)
    snapshot("paywall-legal")
  }

  @MainActor func testPaywallOfferNotEligible() throws {
    let app = try openPaywall(offer: "standard")
    XCTAssertTrue(app.buttons["Upgrade"].waitForExistence(timeout: 5))
    snapshot("paywall-offer-standard")
  }

  @MainActor func testPaywallConfirming() throws {
    let app = try openPaywall(offer: "confirming")
    XCTAssertTrue(app.otherElements["paywall-confirming"].waitForExistence(timeout: 5)
      || app.staticTexts["Confirming…"].waitForExistence(timeout: 5))
    app.swipeUp()
    snapshot("paywall-confirming")
  }

  @MainActor func testPaywallTimeout() throws {
    let app = try openPaywall(offer: "timeout")
    XCTAssertTrue(app.buttons["paywall-retry"].waitForExistence(timeout: 5))
    app.swipeUp()
    snapshot("paywall-timeout")
  }

  @MainActor func testPaywallLargestDynamicType() throws {
    let app = try openPaywall(offer: "eligible", largeText: true)
    XCTAssertTrue(app.buttons["paywall-buy"].waitForExistence(timeout: 5))
    snapshot("paywall-largest-type")
  }

  @MainActor private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
    let list = app.collectionViews.firstMatch
    for _ in 0..<75 {
      if element.exists && element.isHittable && element.frame.maxY < app.frame.maxY - 110 { return }
      let from = list.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.75))
      let to = list.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.45))
      from.press(forDuration: 0.05, thenDragTo: to, withVelocity: .slow, thenHoldForDuration: 0.2)
    }
    XCTFail("Could not reveal \(element)")
  }
}

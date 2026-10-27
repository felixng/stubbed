import XCTest

/// Uses the seeded data: the test user follows @ios_friend (public, 24
/// shows, follows back), and @ios_fan has asked to follow the test user.
final class PeopleUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  private func home() throws -> XCUIApplication {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    return app
  }

  @MainActor
  func testFindPeopleOpenProfileAndEntry() throws {
    let app = try home()
    // Home's search button opens Search people with the field focused.
    app.buttons["Search people"].tap()
    let search = app.searchFields["Name or @handle"]
    XCTAssertTrue(search.waitForExistence(timeout: 10))
    search.tap()
    search.typeText("ios_fr")
    let result = button(app, startingWith: "@ios_friend")
    XCTAssertTrue(result.waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["Following"].exists)
    snapshot("people-search")

    result.tap()
    XCTAssertTrue(app.staticTexts["Fringe every August."].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Calendar"].exists)
    XCTAssertTrue(app.staticTexts["October 2026"].exists)
    snapshot("public-profile")

    // Unfollow (a public profile: no confirmation), then follow again.
    app.buttons["Following"].firstMatch.tap()
    XCTAssertTrue(app.buttons["Follow"].firstMatch.waitForExistence(timeout: 10))
    app.buttons["Follow"].firstMatch.tap()
    XCTAssertTrue(app.buttons["Following"].firstMatch.waitForExistence(timeout: 10))

    // Their newest show, as a public page.
    scrollAndTap(button(app, startingWith: "Operation Mincemeat"), in: app)
    XCTAssertTrue(button(app, startingWith: "More from @ios_friend").waitForExistence(timeout: 10))
    snapshot("public-entry")
  }

  /// Your own public profile's header holds the link and Edit profile in
  /// one List row: Edit profile must open Edit profile, not the link.
  @MainActor
  func testOwnPublicProfileEditOpensSettings() throws {
    let app = try home()
    openTab("Profile", in: app)
    app.buttons["Account"].tap()
    app.buttons["View public profile"].tap()
    XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "instagram.com/ios_test")).firstMatch
      .waitForExistence(timeout: 10))
    app.buttons["Edit profile"].firstMatch.tap()
    XCTAssertTrue(app.navigationBars["Edit profile"].waitForExistence(timeout: 10))
  }

  @MainActor
  func testApproveARequestAndSeeFollowers() throws {
    let app = try home()
    app.buttons["Profile"].tap()
    XCTAssertTrue(app.staticTexts["1 follow request"].waitForExistence(timeout: 10))
    snapshot("follow-request")
    app.buttons["Approve @ios_fan"].tap()
    XCTAssertFalse(app.staticTexts["1 follow request"].waitForExistence(timeout: 5) && app.staticTexts["1 follow request"].isHittable)

    let followers = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Followers")).firstMatch
    XCTAssertTrue(followers.waitForExistence(timeout: 10))
    followers.tap()
    XCTAssertTrue(app.navigationBars["Followers"].waitForExistence(timeout: 10))
    XCTAssertTrue(button(app, startingWith: "@ios_fan").waitForExistence(timeout: 10))
    XCTAssertTrue(button(app, startingWith: "@ios_friend").exists)
    snapshot("followers")

    // Remove the new follower again.
    app.buttons["Remove @ios_fan"].tap()
    app.sheets.buttons["Remove"].firstMatch.tap()
    XCTAssertFalse(button(app, startingWith: "@ios_fan").waitForExistence(timeout: 5) && button(app, startingWith: "@ios_fan").isHittable)
  }
}

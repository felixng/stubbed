import XCTest

/// Uses the seeded data: the test user follows @ios_friend, who has 24
/// public shows, so the feed has 27 and needs a second page.
final class HomeUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testFeedShowsFollowedShowsLikesAndPages() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))

    let friend = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "@ios_friend")).firstMatch
    XCTAssertTrue(friend.waitForExistence(timeout: 15))
    XCTAssertFalse(app.staticTexts["Follow people you go to the theatre with"].exists, "Already follows someone")
    snapshot("home")

    // Like the newest public show, then unlike it.
    let like = app.buttons["Like"].firstMatch
    XCTAssertEqual(like.value as? String, "0 likes")
    like.tap()
    XCTAssertTrue(like.isSelected)
    XCTAssertEqual(like.value as? String, "1 like")
    snapshot("home-liked")
    like.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    XCTAssertFalse(like.isSelected)

    // The 27th show is only on the second page.
    var swipes = 0
    let oldest = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Thu 30 Jul 2026")).firstMatch
    while !oldest.exists, swipes < 40 {
      app.scrollViews.firstMatch.swipeUp()
      swipes += 1
    }
    XCTAssertTrue(oldest.exists, "Scrolled to the second page")
    snapshot("home-page-2")
  }
}

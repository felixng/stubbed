import XCTest

/// Uses the seeded data: @ios_friend liked the test user's Hamilton and
/// left a comment on it.
final class CommentsUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testReadAddAndDeleteComments() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    app.buttons["Profile"].tap()
    scrollAndTap(button(app, startingWith: "Hamilton"), in: app)

    let summary = app.buttons["1 like · 1 comment"]
    scrollAndTap(summary, in: app)
    XCTAssertTrue(app.staticTexts["Front mezz is the best seat in that house."].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Liked by @ios_friend")).firstMatch.exists)

    snapshot("comments-before")
    let field = app.descendants(matching: .any).matching(NSPredicate(format: "placeholderValue == %@", "Add a comment…")).firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), app.debugDescription)
    scrollAndTap(field, in: app)
    field.typeText("Agreed, row B was perfect.")
    app.buttons["Post"].tap()
    XCTAssertTrue(app.staticTexts["Agreed, row B was perfect."].waitForExistence(timeout: 10))
    snapshot("comments")

    // The entry's owner can delete anyone's comment on it.
    // Comments delete with a swipe, then the confirmation.
    app.staticTexts["Front mezz is the best seat in that house."].swipeLeft()
    app.buttons["Delete comment by @ios_friend"].tap()
    app.sheets.buttons["Delete"].firstMatch.tap()
    XCTAssertFalse(app.staticTexts["Front mezz is the best seat in that house."].waitForExistence(timeout: 5))
    app.staticTexts["Agreed, row B was perfect."].swipeLeft()
    app.buttons["Delete your comment"].tap()
    app.sheets.buttons["Delete"].firstMatch.tap()
    XCTAssertTrue(app.staticTexts["No comments yet. Say something nice."].waitForExistence(timeout: 10))
  }
}

import XCTest

final class EntryVideoUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor func testPickTrimSaveAndPlayVideo() throws {
    try XCTSkipUnless(env["STUBBED_VIDEO_FIXTURE"] == "1",
      "Import the synthetic video into Photos and enable video on the disposable stack.")
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    openTab("Profile", in: app)
    scrollAndTap(button(app, startingWith: "Hamilton"), in: app)
    app.navigationBars["Show"].buttons["Edit"].tap()
    scrollAndTap(app.buttons["entry-add-video"], in: app)

    let clip = app.images.matching(NSPredicate(format: "label BEGINSWITH[c] %@", "Video, thirty-two seconds")).firstMatch
    XCTAssertTrue(clip.waitForExistence(timeout: 15))
    let trim = app.navigationBars["Trim video"]
    for _ in 0..<2 {
      clip.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
      if trim.waitForExistence(timeout: 4) || !clip.exists { break }
    }
    XCTAssertTrue(trim.waitForExistence(timeout: 15))
    trim.buttons["Use video"].tap()
    XCTAssertTrue(app.staticTexts["Video ready"].waitForExistence(timeout: 40))
    app.navigationBars["Edit"].buttons["Save"].tap()
    let play = app.buttons["Play video"]
    XCTAssertTrue(play.waitForExistence(timeout: 45))
    play.tap()
    XCTAssertTrue(app.descendants(matching: .any)["entry-video-playing"].firstMatch.waitForExistence(timeout: 15))
  }
}

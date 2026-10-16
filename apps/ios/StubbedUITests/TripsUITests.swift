import XCTest

/// Uses the seeded diary from scripts/test-seed.sql: "NYC Oct 2026" holds
/// Hamilton and Operation Mincemeat.
final class TripsUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  private func openProfile() throws -> XCUIApplication {
    let app = launchApp()
    signOutIfNeeded(app)
    try signIn(app)
    XCTAssertTrue(onHome(app))
    app.buttons["Profile"].tap()
    XCTAssertTrue(app.staticTexts["@ios_test"].waitForExistence(timeout: 10))
    return app
  }

  @MainActor
  func testTripStatsRemoveAndAddShows() throws {
    let app = try openProfile()
    app.buttons["Trips"].tap()
    scrollAndTap(button(app, startingWith: "NYC Oct 2026"), in: app)
    XCTAssertTrue(app.staticTexts["4 Oct – 8 Oct 2026"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.otherElements["2, shows"].exists || app.staticTexts["shows"].exists)
    snapshot("trip")

    app.buttons["Select"].tap()
    scrollAndTap(button(app, startingWith: "Hamilton"), in: app)
    app.buttons["Take 1 out of this trip"].tap()
    XCTAssertTrue(app.buttons["Add shows"].waitForExistence(timeout: 10))
    XCTAssertFalse(button(app, startingWith: "Hamilton").exists)

    app.buttons["Add shows"].tap()
    app.buttons["Add 1 to this trip"].tap()
    XCTAssertTrue(button(app, startingWith: "Hamilton").waitForExistence(timeout: 10))
  }

  @MainActor
  func testGroupDiaryShowsIntoANewTripThenDeleteIt() throws {
    let app = try openProfile()
    let select = app.buttons["Select"]
    scrollAndTap(select, in: app)
    scrollAndTap(button(app, startingWith: "Stereophonic"), in: app)
    app.buttons["Add to trip"].tap()
    app.buttons["New trip"].tap()

    let name = app.textFields["Name"]
    XCTAssertTrue(name.waitForExistence(timeout: 10))
    name.typeText("London Sept")
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "The 1 show you picked")).firstMatch.exists)
    app.buttons["Create trip"].tap()

    XCTAssertTrue(app.navigationBars["London Sept"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["12 Sept 2026"].exists || app.staticTexts["12 Sep 2026"].exists)
    XCTAssertTrue(button(app, startingWith: "Stereophonic").exists)
    snapshot("new-trip")

    scrollAndTap(app.buttons["Delete trip"], in: app)
    app.sheets.buttons["Delete trip"].firstMatch.tap()
    XCTAssertTrue(app.staticTexts["@ios_test"].waitForExistence(timeout: 10))
  }

  @MainActor
  func testTripRecapCardsDraw() throws {
    let app = try openProfile()
    app.buttons["Trips"].tap()
    scrollAndTap(button(app, startingWith: "NYC Oct 2026"), in: app)
    for n in 1...4 {
      let card = app.images.matching(NSPredicate(format: "label BEGINSWITH %@", "Share card \(n) of 4")).firstMatch
      XCTAssertTrue(card.waitForExistence(timeout: 15))
      snapshot("trip-card-\(n)")
      if n < 4 { card.swipeLeft() }
    }
    XCTAssertFalse(app.buttons["Background"].exists, "Trip cards have no background toggle")
  }
}

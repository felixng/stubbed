import XCTest

/// Creating an account with email (#149): the code from the confirmation
/// email, read from local Supabase's Mailpit, signs the new account in and
/// the app moves on to Welcome. And "Forgot your password?".
final class SignUpUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testCreateAccountWithEmailCode() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    app.buttons["Create an account"].tap()
    XCTAssertTrue(app.navigationBars["Create account"].waitForExistence(timeout: 5))

    let email = "ios-signup-\(Int(Date().timeIntervalSince1970))@stubbed.local"
    // The sign-in screen's own Email field is still behind the sheet.
    let field = app.textFields["sign-up-email"]
    tap(field)
    field.typeText(email)
    let password = app.secureTextFields["sign-up-password"]
    tap(password)
    password.typeText("theatre-2026")
    snapshot("sign-up")
    app.navigationBars["Create account"].buttons["Create"].tap()

    XCTAssertTrue(app.navigationBars["Check your email"].waitForExistence(timeout: 15))
    let code = try XCTUnwrap(mailedCode(to: email), "No confirmation email in Mailpit")
    let codeField = app.textFields["sign-up-code"]
    tap(codeField)
    codeField.typeText(code)
    snapshot("sign-up-code")
    app.navigationBars["Check your email"].buttons["Confirm"].tap()
    dismissSavePassword(app, within: 3)

    XCTAssertTrue(app.staticTexts["Set up your profile"].waitForExistence(timeout: 15))
  }

  @MainActor
  func testForgotPassword() throws {
    let app = launchApp()
    signOutIfNeeded(app)
    app.buttons["Forgot your password?"].tap()
    XCTAssertTrue(app.navigationBars["Reset password"].waitForExistence(timeout: 5))
    let field = app.textFields["reset-email"]
    tap(field)
    field.typeText("ios-test@stubbed.local")
    app.navigationBars["Reset password"].buttons["Send"].tap()
    XCTAssertTrue(app.staticTexts["Check your email"].waitForExistence(timeout: 15))
    app.navigationBars["Reset password"].buttons["Done"].tap()
  }

  /// The 6-digit code in the newest email to `address`, from Mailpit's API.
  private func mailedCode(to address: String) throws -> String? {
    let base = "http://127.0.0.1:54324/api/v1"
    for _ in 0..<20 {
      let search = URL(string: "\(base)/search?query=to:\(address)")!
      if let data = try? Data(contentsOf: search),
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
        let id = (json["messages"] as? [[String: Any]])?.first?["ID"] as? String,
        let full = try? Data(contentsOf: URL(string: "\(base)/message/\(id)")!),
        let message = try JSONSerialization.jsonObject(with: full) as? [String: Any],
        let html = message["HTML"] as? String,
        let range = html.range(of: #">(\d{6})<"#, options: .regularExpression)
      {
        return String(html[range].dropFirst().dropLast())
      }
      Thread.sleep(forTimeInterval: 0.5)
    }
    return nil
  }
}

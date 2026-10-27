import Supabase
import SwiftUI

/// Create an account with email + password (#149), from Sign in. Two steps
/// in one sheet: the email and a password, then the 6-digit code from the
/// confirmation email (supabase/templates/confirmation.html; its link opens
/// the web instead). Verifying signs them in, and the session gate moves on
/// to Welcome for a handle. Apple and Google need no sheet: they create the
/// account from Sign in.
struct SignUpView: View {
  private enum Field { case email, password, code }

  @Environment(\.dismiss) private var dismiss

  @State private var email = ""
  @State private var password = ""
  @State private var code = ""
  /// The address the code went to, once sent.
  @State private var sentTo: String?
  @State private var error: String?
  @State private var notice: String?
  @State private var busy = false
  @FocusState private var focus: Field?

  private static let minPassword = 8

  var body: some View {
    NavigationStack {
      Form {
        if let sentTo {
          Section {
            TextField("Code", text: $code, prompt: Text(verbatim: "123456"))
              .textContentType(.oneTimeCode)
              .keyboardType(.numberPad)
              .focused($focus, equals: .code)
              .accessibilityIdentifier("sign-up-code")
              .font(.title3.monospacedDigit())
          } header: {
            Text("Confirmation code")
          } footer: {
            Text("We’ve emailed a 6-digit code to \(sentTo). Enter it here, or open the link in the email.")
          }
          Section {
            Button("Send a new code") { Task { await resend() } }
              .disabled(busy)
            Button("Use a different email") {
              self.sentTo = nil
              code = ""
              error = nil
              notice = nil
            }
          } footer: {
            message
          }
        } else {
          Section {
            TextField("Email", text: $email, prompt: Text(verbatim: "you@example.com"))
              .textContentType(.username)
              .keyboardType(.emailAddress)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
              .focused($focus, equals: .email)
              .accessibilityIdentifier("sign-up-email")
              .submitLabel(.next)
              .onSubmit { focus = .password }
            SecureField("Password", text: $password, prompt: Text("Password"))
              // Not .newPassword: its strong-password offer swallows typing
              // in UI tests. iOS still offers to save the password.
              .textContentType(.password)
              .focused($focus, equals: .password)
              .accessibilityIdentifier("sign-up-password")
              .submitLabel(.go)
              .onSubmit { Task { await signUp() } }
          } footer: {
            if error == nil {
              Text("Use at least \(Self.minPassword) characters for your password.")
            } else {
              message
            }
          }
          Section {
          } footer: {
            Text("By creating an account you agree to the [Terms](https://getstubbed.app/terms) and [Privacy Policy](https://getstubbed.app/privacy).")
          }
        }
      }
      .navigationTitle(sentTo == nil ? "Create account" : "Check your email")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          if busy {
            ProgressView()
          } else if sentTo == nil {
            Button("Create") { Task { await signUp() } }
              .disabled(email.isEmpty || password.isEmpty)
          } else {
            Button("Confirm") { Task { await verify() } }
              .disabled(code.count < 6)
          }
        }
      }
      .onAppear { focus = .email }
      .onChange(of: error) { _, message in
        if let message { AccessibilityNotification.Announcement(message).post() }
      }
    }
    .interactiveDismissDisabled(busy)
  }

  @ViewBuilder private var message: some View {
    if let error {
      Text(error).foregroundStyle(.red)
    } else if let notice {
      Text(notice)
    }
  }

  private func signUp() async {
    let email = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !email.isEmpty, !password.isEmpty else {
      error = "Enter your email and a password."
      return
    }
    guard password.count >= Self.minPassword else {
      error = "Use at least \(Self.minPassword) characters for your password."
      return
    }
    busy = true
    defer { busy = false }
    do {
      let response = try await supabase.auth.signUp(email: email, password: password)
      error = nil
      // Without email confirmation (some local setups) they're in already.
      if response.session != nil { return dismiss() }
      sentTo = email
      focus = .code
    } catch {
      self.error = Self.message(for: error, fallback: "Couldn’t create your account. Try again.")
    }
  }

  private func verify() async {
    guard let sentTo else { return }
    busy = true
    defer { busy = false }
    do {
      try await supabase.auth.verifyOTP(email: sentTo, token: code.trimmingCharacters(in: .whitespaces), type: .signup)
      error = nil
      // AppSession hears the sign-in; the gate shows Welcome.
      dismiss()
    } catch {
      self.error = Self.message(for: error, fallback: "That code didn’t work. Check it, or send a new one.")
    }
  }

  private func resend() async {
    guard let sentTo else { return }
    busy = true
    defer { busy = false }
    do {
      try await supabase.auth.resend(email: sentTo, type: .signup)
      error = nil
      notice = "A new code is on its way."
    } catch {
      self.error = Self.message(for: error, fallback: "Couldn’t send a new code. Try again.")
    }
  }

  static func message(for error: any Error, fallback: String) -> String {
    switch (error as? AuthError)?.errorCode.rawValue {
    case "weak_password": "Choose a stronger password: longer, and not a common one."
    case "over_email_send_rate_limit", "over_request_rate_limit": "Too many attempts. Wait a few minutes, then try again."
    case "email_address_invalid": "That email address doesn’t look right."
    case "otp_expired": "That code has expired. Send a new one."
    default: fallback
    }
  }
}

/// "Forgot your password?", from Sign in: an email with a link to choose a
/// new password on the web (/reset-password), then back here to sign in.
struct ForgotPasswordView: View {
  @Environment(\.dismiss) private var dismiss
  @State var email: String
  @State private var sent = false
  @State private var error: String?
  @State private var busy = false
  @FocusState private var focused: Bool

  var body: some View {
    NavigationStack {
      Form {
        if sent {
          ContentUnavailableView {
            Label("Check your email", systemImage: "envelope")
          } description: {
            Text("If \(email) has a Stubbed account, a link to choose a new password is on its way. Then sign in here with it.")
          }
          .listRowBackground(Color.clear)
        } else {
          Section {
            TextField("Email", text: $email, prompt: Text(verbatim: "you@example.com"))
              .textContentType(.username)
              .keyboardType(.emailAddress)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
              .focused($focused)
              .accessibilityIdentifier("reset-email")
              .submitLabel(.send)
              .onSubmit { Task { await send() } }
          } footer: {
            if let error {
              Text(error).foregroundStyle(.red)
            } else {
              Text("We’ll email you a link to choose a new password.")
            }
          }
        }
      }
      .navigationTitle("Reset password")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        if sent {
          ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
        } else {
          ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
          ToolbarItem(placement: .confirmationAction) {
            if busy {
              ProgressView()
            } else {
              Button("Send") { Task { await send() } }
                .disabled(email.trimmingCharacters(in: .whitespaces).isEmpty)
            }
          }
        }
      }
      .onAppear { focused = email.isEmpty }
    }
  }

  private func send() async {
    let address = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !address.isEmpty else { return }
    busy = true
    defer { busy = false }
    do {
      try await supabase.auth.resetPasswordForEmail(
        address, redirectTo: AppConfig.current.webURL.appending(path: "auth/confirm"))
      email = address
      sent = true
    } catch {
      // The same answer whether or not the address has an account, unless
      // it's a limit they should know about.
      let code = (error as? AuthError)?.errorCode
      if code == .overEmailSendRateLimit || code == .overRequestRateLimit {
        self.error = "Too many attempts. Wait a few minutes, then try again."
      } else {
        email = address
        sent = true
      }
    }
  }
}

import AuthenticationServices
import CryptoKit
import Supabase
import SwiftUI

/// Sign in with Apple, Google, or email + password, like the web's /login.
/// Sign-ups are off in Supabase Auth, so only existing accounts get in.
struct SignInView: View {
  private enum Field { case email, password }

  @Environment(AppSession.self) private var session

  @State private var email = ""
  @State private var password = ""
  @State private var error: String?
  @State private var busy = false
  @State private var nonce = ""
  @FocusState private var focus: Field?

  var body: some View {
    ScrollView {
      VStack(spacing: Space.xxxl) {
        VStack(spacing: Space.m) {
          Wordmark(size: 44)
          Text("Sign in")
            .font(.title2.bold())
        }
        .padding(.top, 48)

        if session.deletedNotice {
          Text("Your account and everything in it have been deleted.")
            .font(.subheadline.weight(.medium))
            .padding(.horizontal, Space.l)
            .padding(.vertical, Space.m)
            .frame(maxWidth: .infinity, alignment: .leading)
            .groupedCard()
        }

        VStack(spacing: Space.m) {
          SignInWithAppleButton(.continue, onRequest: prepareApple, onCompletion: finishApple)
            .signInWithAppleButtonStyle(.black)
            .frame(height: 50)
            .clipShape(.capsule)
            .disabled(busy)

          Button {
            Task { await signInWithGoogle() }
          } label: {
            Text("Continue with Google")
              .frame(maxWidth: .infinity)
          }
          .buttonStyle(.bordered)
          .controlSize(.large)
          .disabled(busy)
        }

        HStack(spacing: Space.m) {
          VStack { Divider() }
          Text("or")
          VStack { Divider() }
        }
        .font(.footnote)
        .foregroundStyle(.secondary)

        VStack(alignment: .leading, spacing: Space.l) {
          VStack(spacing: 0) {
          field("Email") {
            TextField("Email", text: $email, prompt: Text(verbatim: "you@example.com"))
              .textContentType(.username)
              .keyboardType(.emailAddress)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
              .focused($focus, equals: .email)
              .submitLabel(.next)
              .onSubmit { focus = .password }
          }
          field("Password") {
            SecureField("", text: $password)
              .textContentType(.password)
              .focused($focus, equals: .password)
              .submitLabel(.go)
              .onSubmit { Task { await signInWithPassword() } }
          }
          }
          .groupedCard()
          if let error {
            Text(error)
              .font(.footnote)
              .foregroundStyle(.red)
              .accessibilityAddTraits(.isStaticText)
          }
          Button {
            Task { await signInWithPassword() }
          } label: {
            Text(busy ? "Signing in…" : "Sign in").frame(maxWidth: .infinity)
          }
          .buttonStyle(.borderedProminent)
          .controlSize(.large)
          .disabled(busy)
        }
      }
      .frame(maxWidth: 380)
      .padding(.horizontal, Space.l)
      .frame(maxWidth: .infinity)
    }
    .scrollDismissesKeyboard(.interactively)
    .background(Color(.systemGroupedBackground))
    .onChange(of: error) { _, message in
      if let message { AccessibilityNotification.Announcement(message).post() }
    }
  }

  /// A row of the grouped email and password card: label, then the field.
  @ViewBuilder private func field<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
    if title != "Email" { Divider().padding(.leading, Space.l) }
    HStack(spacing: Space.m) {
      Text(title)
        .font(.body)
        .frame(width: 88, alignment: .leading)
        .accessibilityHidden(true)
      content()
        .font(.body)
        .accessibilityLabel(title)
    }
    .padding(.horizontal, Space.l)
    .frame(minHeight: 50)
  }

  // MARK: - Email + password

  /// One message for every failure, so the form never reveals which emails
  /// have an account.
  private func signInWithPassword() async {
    let email = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !email.isEmpty, !password.isEmpty else {
      error = "Enter your email and password."
      return
    }
    busy = true
    defer { busy = false }
    do {
      try await supabase.auth.signIn(email: email, password: password)
      error = nil
    } catch let authError as AuthError where authError.errorCode == .overRequestRateLimit {
      error = "Too many attempts. Wait a minute, then try again."
    } catch {
      self.error = "Email or password is incorrect."
    }
  }

  // MARK: - Apple

  private func prepareApple(_ request: ASAuthorizationAppleIDRequest) {
    nonce = Self.randomNonce()
    request.requestedScopes = [.email, .fullName]
    request.nonce = Self.sha256(nonce)
  }

  private func finishApple(_ result: Result<ASAuthorization, any Error>) {
    switch result {
    case .failure(let failure):
      if (failure as? ASAuthorizationError)?.code != .canceled { error = Self.appleError }
    case .success(let authorization):
      guard
        let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
        let token = credential.identityToken.flatMap({ String(data: $0, encoding: .utf8) })
      else {
        error = Self.appleError
        return
      }
      let nonce = nonce
      Task {
        busy = true
        defer { busy = false }
        do {
          try await supabase.auth.signInWithIdToken(
            credentials: .init(provider: .apple, idToken: token, nonce: nonce))
          error = nil
        } catch {
          Log.app.error("Apple sign-in failed: \(error.localizedDescription, privacy: .public)")
          self.error = Self.appleError
        }
      }
    }
  }

  // "Hide My Email" gives Stubbed a relay address, which matches no account.
  private static let appleError =
    "Couldn’t sign in with Apple. Use the Apple Account that matches your Stubbed email, and choose “Share My Email”."

  static func randomNonce(length: Int = 32) -> String {
    let characters = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
    var generator = SystemRandomNumberGenerator()
    return String((0..<length).map { _ in characters.randomElement(using: &generator)! })
  }

  static func sha256(_ input: String) -> String {
    SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
  }

  // MARK: - Google

  /// Google's consent page in a secure browser sheet, back to the app via
  /// stubbed://auth-callback. No Google SDK needed.
  private func signInWithGoogle() async {
    busy = true
    defer { busy = false }
    do {
      try await supabase.auth.signInWithOAuth(provider: .google, redirectTo: authCallbackURL) { session in
        session.prefersEphemeralWebBrowserSession = false
      }
      error = nil
    } catch let failure as ASWebAuthenticationSessionError where failure.code == .canceledLogin {
      // Closed the sheet: nothing to say.
    } catch {
      Log.app.error("Google sign-in failed: \(error.localizedDescription, privacy: .public)")
      self.error = "Couldn’t sign in with Google. Use the Google account that matches your Stubbed email."
    }
  }
}

#Preview {
  SignInView().environment(AppSession())
}

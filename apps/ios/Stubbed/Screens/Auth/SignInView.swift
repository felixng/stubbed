import AuthenticationServices
import CryptoKit
import GoogleSignIn
import Supabase
import SwiftUI

/// Sign in with Apple, Google, or email + password, like the web's /login.
/// Apple and Google create the account the first time; an email account is
/// created in the Create account sheet (SignUpView).
struct SignInView: View {
  private enum Field { case email, password }

  @Environment(AppSession.self) private var session

  @State private var email = ""
  @State private var password = ""
  @State private var error: String?
  @State private var busy = false
  @State private var nonce = ""
  @State private var creating = false
  @State private var resetting = false
  @FocusState private var focus: Field?

  var body: some View {
    ScrollView {
      VStack(spacing: Space.xxxl) {
        VStack(spacing: Space.m) {
          Wordmark(size: 44, mark: true)
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

          Button("Forgot your password?") { resetting = true }
            .font(.subheadline)
            .frame(maxWidth: .infinity)
        }

        VStack(spacing: Space.s) {
          Text("New to Stubbed?")
            .foregroundStyle(.secondary)
          Button("Create an account") { creating = true }
            .buttonStyle(.bordered)
            .controlSize(.large)
        }
        .font(.subheadline)
        .padding(.bottom, Space.xxl)
      }
      .frame(maxWidth: 380)
      .padding(.horizontal, Space.l)
      .frame(maxWidth: .infinity)
    }
    .scrollDismissesKeyboard(.interactively)
    .background(Color(.systemGroupedBackground))
    .sheet(isPresented: $creating) { SignUpView() }
    .sheet(isPresented: $resetting) { ForgotPasswordView(email: email) }
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

  private static let appleError = "Couldn’t sign in with Apple. Try again, or use your email."

  static func randomNonce(length: Int = 32) -> String {
    let characters = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
    var generator = SystemRandomNumberGenerator()
    return String((0..<length).map { _ in characters.randomElement(using: &generator)! })
  }

  static func sha256(_ input: String) -> String {
    SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
  }

  // MARK: - Google

  /// Google's own sign-in sheet (#180), which names Stubbed and google.com.
  /// Its ID token goes to Supabase with the nonce, as for Apple. Without a
  /// client ID configured, Google's page through Supabase instead.
  private func signInWithGoogle() async {
    busy = true
    defer { busy = false }
    if let clientID = AppConfig.current.googleClientID {
      await signInWithGoogleSDK(clientID: clientID)
      return
    }
    do {
      try await supabase.auth.signInWithOAuth(provider: .google, redirectTo: authCallbackURL) { session in
        session.prefersEphemeralWebBrowserSession = false
      }
      error = nil
    } catch let failure as ASWebAuthenticationSessionError where failure.code == .canceledLogin {
      // Closed the sheet: nothing to say.
    } catch {
      Log.app.error("Google sign-in failed: \(error.localizedDescription, privacy: .public)")
      self.error = "Couldn’t sign in with Google. Try again, or use your email."
    }
  }

  private func signInWithGoogleSDK(clientID: String) async {
    guard let presenter = Self.topViewController() else { return }
    let nonce = Self.randomNonce()
    GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
    do {
      let result = try await GIDSignIn.sharedInstance.signIn(
        withPresenting: presenter, hint: nil, additionalScopes: nil, nonce: Self.sha256(nonce))
      guard let idToken = result.user.idToken?.tokenString else {
        error = "Couldn’t sign in with Google. Try again, or use your email."
        return
      }
      try await supabase.auth.signInWithIdToken(
        credentials: .init(
          provider: .google, idToken: idToken, accessToken: result.user.accessToken.tokenString, nonce: nonce))
      error = nil
    } catch let failure as GIDSignInError where failure.code == .canceled {
      // Closed the sheet: nothing to say.
    } catch {
      Log.app.error("Google sign-in failed: \(error.localizedDescription, privacy: .public)")
      self.error = "Couldn’t sign in with Google. Try again, or use your email."
    }
  }

  /// The view controller to present Google's sheet from.
  @MainActor private static func topViewController() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
    var top = scene?.keyWindow?.rootViewController
    while let presented = top?.presentedViewController { top = presented }
    return top
  }
}

#Preview {
  SignInView().environment(AppSession())
}

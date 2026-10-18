import SwiftUI

/// Picks the screen for where the user is: signing in, setting up their
/// profile, or using the app.
struct SessionGate: View {
  @Environment(AppSession.self) private var session

  var body: some View {
    Group {
      switch session.phase {
      case .starting:
        Color(.systemGroupedBackground)
          .ignoresSafeArea()
          .overlay { Wordmark(size: 36) }
      case .signedOut:
        SignInView()
      case .needsProfile:
        WelcomeView()
      case .ready:
        // The session gives each sign-in a fresh router, so tabs and pushed
        // screens never carry over from the last session.
        RootView()
      case .failed(let message):
        VStack(spacing: Space.l) {
          Text(message)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
          Button("Try again") { Task { await session.reload() } }
            .buttonStyle(.tintedPill)
        }
        .padding(Space.xxl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
      }
    }
    .animation(.default, value: session.phase)
    .onOpenURL { url in
      // Google sign-in's return is handled by the auth library.
      if let route = DeepLink.route(for: url) { session.pendingLink = route }
    }
  }
}

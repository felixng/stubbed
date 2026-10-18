import Foundation
import Observation
import Supabase

/// Who's signed in, and whether they've set up their profile yet. Like the
/// web's proxy: signed out → sign in; signed in without a handle → welcome;
/// otherwise the app.
@MainActor @Observable
final class AppSession {
  enum Phase: Equatable {
    case starting
    case signedOut
    case needsProfile
    case ready
    case failed(String)
  }

  private(set) var phase = Phase.starting
  private(set) var userId: UUID?
  private(set) var user: User?
  /// Tabs, navigation and sheets for whoever is signed in. A new one on
  /// every sign-in, so nothing carries over from the last session.
  private(set) var router = AppRouter()
  /// A link opened before sign-in, followed once the app is ready.
  var pendingLink: AppRouter.Route?
  /// Shows "Your account … has been deleted" on the sign-in screen.
  private(set) var deletedNotice = false

  /// Follows sign-in, sign-out and token refreshes for the app's lifetime.
  func observe() async {
    for await (event, session) in supabase.auth.authStateChanges {
      Log.app.debug("Auth event: \(event.rawValue, privacy: .public)")
      switch event {
      case .initialSession, .signedIn, .signedOut, .userDeleted:
        await update(session)
      case .tokenRefreshed, .userUpdated:
        user = session?.user
      default:
        break
      }
    }
  }

  /// Checks the profile again, e.g. after "Try again".
  func reload() async {
    phase = .starting
    await update(try? await supabase.auth.session)
  }

  /// The welcome screen saved a handle.
  func profileCompleted() {
    router = AppRouter()
    phase = .ready
  }

  /// This device only, like the web: other devices stay signed in.
  func signOut() async {
    do {
      try await supabase.auth.signOut(scope: .local)
    } catch {
      Log.app.error("Sign out failed: \(error.localizedDescription, privacy: .public)")
    }
  }

  /// The account is gone: clear the local session and say so at sign-in.
  func accountDeleted() {
    deletedNotice = true
    Task { await signOut() }
  }

  private func update(_ session: Session?) async {
    guard let session else {
      userId = nil
      user = nil
      phase = .signedOut
      return
    }
    deletedNotice = false
    userId = session.user.id
    user = session.user
    do {
      struct Row: Decodable { let handle: String? }
      let rows: [Row] = try await supabase.from("profiles")
        .select("handle")
        .eq("id", value: session.user.id)
        .limit(1)
        .execute()
        .value
      let next: Phase = rows.first?.handle == nil ? .needsProfile : .ready
      if next == .ready, phase != .ready { router = AppRouter() }
      phase = next
    } catch {
      Log.data.error("Profile check failed: \(error.localizedDescription, privacy: .public)")
      phase = .failed("Couldn’t load your profile. Check your connection and try again.")
    }
  }
}

import SwiftUI

@main
struct StubbedApp: App {
  @UIApplicationDelegateAdaptor(PushAppDelegate.self) private var pushDelegate
  @State private var session: AppSession
  @State private var membership: Membership
  @State private var paywall: PaywallRouter
  @Environment(\.scenePhase) private var scenePhase

  init() {
    let session = AppSession()
    let membership = Membership()
    _session = State(initialValue: session)
    _membership = State(initialValue: membership)
    _paywall = State(initialValue: Billing.makeRouter(membership: membership, session: session))
  }

  var body: some Scene {
    WindowGroup {
      SessionGate()
        .environment(session)
        .environment(membership)
        .environment(paywall)
        // Membership follows the signed-in account: cleared on sign-out, reloaded on sign-in,
        // an account switch and returning to the foreground.
        .task(id: session.userId) {
          // The purchasing SDK follows the account too: signed in as them, out on sign-out,
          // so Pro never carries across accounts.
          await paywall.flow.accountChanged(session.userId)
          await membership.reload(for: session.userId)
        }
        .onChange(of: scenePhase) { _, phase in
          guard phase == .active else { return }
          Task {
            if session.userId != nil { await paywall.flow.refreshFromServer() }
            await membership.reload(for: session.userId)
          }
        }
        .task { await session.observe() }
        .task {
          while !Task.isCancelled {
            await PushRegistration.shared.retryCleanup()
            do { try await Task.sleep(for: .seconds(30)) } catch { return }
          }
        }
        .tint(Palette.tintText)
        // Light until every screen is on the native style (system colours
        // read in dark mode; some older screens still use web tokens).
        .preferredColorScheme(.light)
    }
  }
}

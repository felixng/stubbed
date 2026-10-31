import SwiftUI

@main
struct StubbedApp: App {
  @UIApplicationDelegateAdaptor(PushAppDelegate.self) private var pushDelegate
  @State private var session = AppSession()

  var body: some Scene {
    WindowGroup {
      SessionGate()
        .environment(session)
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

import SwiftUI

@main
struct StubbedApp: App {
  @State private var session = AppSession()

  var body: some Scene {
    WindowGroup {
      SessionGate()
        .environment(session)
        .task { await session.observe() }
        .tint(Palette.tintText)
        // Light until every screen is on the native style (system colours
        // read in dark mode; some older screens still use web tokens).
        .preferredColorScheme(.light)
    }
  }
}

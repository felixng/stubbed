import SwiftUI

enum ShareBackground: String, CaseIterable, Identifiable {
  case solid, gradient, transparent
  var id: String { rawValue }
  var name: String { rawValue.capitalized }
}

enum ShareInk: String, CaseIterable, Identifiable {
  case light, dark
  var id: String { rawValue }
  var name: String { rawValue.capitalized }
}

struct ShareAppearance: Hashable {
  var background: ShareBackground = .solid
  var ink: ShareInk = .light
  static let standard = ShareAppearance()
  static let variants: [Self] = [
    .standard, .init(background: .gradient), .init(background: .transparent),
    .init(background: .transparent, ink: .dark),
  ]
  var foreground: Color { background == .transparent && ink == .dark ? Color(white: 0.08) : .white }
  var key: String { "\(background.rawValue)-\(background == .transparent ? ink.rawValue : "light")" }
}

struct ShareCardSurface: View {
  let appearance: ShareAppearance
  var body: some View {
    switch appearance.background {
    case .solid: CardInk.ground
    case .gradient:
      LinearGradient(colors: [Color(red: 0.39, green: 0.04, blue: 0.23), Color(red: 0.48, green: 0.09, blue: 0.16), CardInk.ground], startPoint: .topLeading, endPoint: .bottomTrailing)
    case .transparent: Color.clear
    }
  }
}

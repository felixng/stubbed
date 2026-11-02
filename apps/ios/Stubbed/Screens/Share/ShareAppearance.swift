import SwiftUI

/// The grounds a data card can be drawn on. `dark` keeps the raw value
/// "solid" so `card_shared` analytics stay comparable with earlier shares.
enum ShareBackground: String, CaseIterable, Identifiable {
  case dark = "solid", light, gradient, transparent
  var id: String { rawValue }
  var name: String {
    switch self {
    case .dark: "Dark"
    case .light: "Light"
    case .gradient: "Gradient"
    case .transparent: "Transparent"
    }
  }
}

/// Text colour, chosen only on a transparent card. The other grounds set it.
enum ShareInk: String, CaseIterable, Identifiable {
  case light, dark
  var id: String { rawValue }
  var name: String { rawValue.capitalized }
  var color: Color { self == .dark ? Color(white: 0.08) : .white }
}

struct ShareAppearance: Hashable {
  var background: ShareBackground = .dark
  var ink: ShareInk = .light
  static let standard = ShareAppearance()
  static let variants: [Self] = [
    .standard, .init(background: .light), .init(background: .gradient),
    .init(background: .transparent), .init(background: .transparent, ink: .dark),
  ]
  var foreground: Color {
    switch background {
    case .light: ShareInk.dark.color
    case .transparent: ink.color
    case .dark, .gradient: ShareInk.light.color
    }
  }
  /// Fixed export colours: the surrounding app's colour scheme must not turn
  /// light-background highlights into the lighter dark-mode tint.
  var statsAccent: Color {
    let darkInk = background == .light || (background == .transparent && ink == .dark)
    return darkInk
      ? Color(red: 220.0 / 255, green: 47.0 / 255, blue: 79.0 / 255)
      : Color(red: 1, green: 90.0 / 255, blue: 90.0 / 255)
  }
  var key: String { "\(background.rawValue)-\(background == .transparent ? ink.rawValue : "light")" }
}

struct ShareCardSurface: View {
  let appearance: ShareAppearance
  var body: some View {
    switch appearance.background {
    case .dark: CardInk.ground
    case .light: Color.white
    case .gradient:
      LinearGradient(colors: [Color(red: 0.39, green: 0.04, blue: 0.23), Color(red: 0.48, green: 0.09, blue: 0.16), CardInk.ground], startPoint: .topLeading, endPoint: .bottomTrailing)
    case .transparent: Color.clear
    }
  }
}

/// A background as a round swatch: the card's own ground, or a checkerboard
/// for transparent.
struct ShareBackgroundSwatch: View {
  let background: ShareBackground
  var body: some View {
    ZStack {
      if background == .transparent { Checkerboard() } else { ShareCardSurface(appearance: .init(background: background)) }
    }
    .clipShape(Circle())
    .overlay(Circle().strokeBorder(Color.primary.opacity(0.12), lineWidth: 1))
  }
}

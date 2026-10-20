import SwiftUI
import UIKit

/// Stubbed's coral accent, from the web's tokens (apps/web/src/app/globals.css),
/// with light and dark values. Only for interactive elements, highlights and
/// stars; text and backgrounds use system colours (apps/ios/CLAUDE.md,
/// "Design direction"). The app is light-only for now, set in StubbedApp.
enum Palette {
  static let tint = Color(light: 0xFF7A5C, dark: 0xFF6B4A)
  static let tintPressed = Color(light: 0xF2603F, dark: 0xFF8A70)
  static let tintText = Color(light: 0xB33A19, dark: 0xFF6B4A)
  static let tintFill = Color(light: 0xFFE0D5, dark: 0x3D1A11)
  /// Text on `tint`: dark, since white on coral fails contrast.
  static let onTint = Color(light: 0x1F1210, dark: 0x000000)
  static let star = Color(light: 0xB96F00, dark: 0xFFD60A)
  /// The warm shadow under the trip cards' photo stacks (share cards only).
  static let shadow = Color(red: 120 / 255, green: 50 / 255, blue: 30 / 255)
}

/// Corner radii: posters, and inputs outside a Form. Grouped containers
/// use `Grouped.radius`.
enum Radius {
  static let sm: CGFloat = 8
  static let md: CGFloat = 12
}

/// The web's spacing steps (4, 8, 12, 16, 20, 24, 32) and the 44pt touch target.
enum Space {
  static let xs: CGFloat = 4
  static let s: CGFloat = 8
  static let m: CGFloat = 12
  static let l: CGFloat = 16
  static let xl: CGFloat = 20
  static let xxl: CGFloat = 24
  static let xxxl: CGFloat = 32
  static let touch: CGFloat = 44
}

extension Color {
  init(light: UInt32, dark: UInt32) {
    self.init(
      uiColor: UIColor { traits in
        UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light)
      })
  }
}

extension UIColor {
  convenience init(hex: UInt32) {
    self.init(
      red: CGFloat((hex >> 16) & 0xFF) / 255,
      green: CGFloat((hex >> 8) & 0xFF) / 255,
      blue: CGFloat(hex & 0xFF) / 255,
      alpha: 1)
  }
}

/// Native grouping (apps/ios/CLAUDE.md, "Design direction").
enum Grouped {
  static let radius: CGFloat = 16
  static let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
}

extension View {
  /// An inset grouped container: `secondarySystemGroupedBackground`, 16pt
  /// continuous corners and a 1pt stroke at 6% of the label colour. No shadow.
  func groupedCard() -> some View {
    self
      .background(Color(.secondarySystemGroupedBackground), in: Grouped.shape)
      .clipShape(Grouped.shape)
      .overlay(Grouped.shape.strokeBorder(Color.primary.opacity(0.06), lineWidth: 1))
  }

  /// Extra room under a scroll view's content, so its last rows (Delete
  /// buttons included) scroll well clear of the tab bar.
  func tabBarClearance() -> some View {
    contentMargins(.bottom, 80, for: .scrollContent)
  }

}

/// A whole card as one tap target: it scales to 98% while pressed, with the
/// system's default animation.
struct CardPressStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .contentShape(.rect)
      .scaleEffect(configuration.isPressed ? 0.98 : 1)
      .animation(.default, value: configuration.isPressed)
  }
}

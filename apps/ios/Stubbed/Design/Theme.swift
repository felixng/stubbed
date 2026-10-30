import SwiftUI
import UIKit

/// Footlight Sweep: the app icon's colours, from the web's tokens
/// (apps/web/src/app/globals.css), with light and dark values. The coral is
/// only for interactive elements, highlights and stars; text and backgrounds
/// use system colours (apps/ios/CLAUDE.md, "Design direction"). The app is
/// light-only for now, set in StubbedApp.
enum Palette {
  /// The icon's coral, a step deeper on light so white text on it passes.
  static let tint = Color(light: 0xDC2F4F, dark: 0xFF5A5A)
  static let tintPressed = Color(light: 0xC4234A, dark: 0xFF7A7A)
  static let tintText = Color(light: 0xC4234A, dark: 0xFF5A5A)
  static let tintFill = Color(light: 0xFFE4E1, dark: 0x3A1418)
  /// Text on `tint`.
  static let onTint = Color(light: 0xFFFFFF, dark: 0x000000)
  /// Green status treatment for the current-year IN PROGRESS badge.
  static let progressText = Color(light: 0x146C35, dark: 0x8AE4A5)
  static let progressFill = Color(light: 0xE6F4EA, dark: 0x183D25)
  static let star = Color(light: 0xE07400, dark: 0xFFA040)
  /// The app icon's gradient, magenta to coral to amber: behind avatars and
  /// posters with no photo, an empty profile cover and your own avatar's
  /// ring. Only white bold text goes on it, centred, where the coral passes 3:1.
  static let sweep = LinearGradient(
    colors: [Color(light: 0xE8247F, dark: 0xE8247F), Color(light: 0xFF5A5A, dark: 0xFF5A5A), Color(light: 0xFFA040, dark: 0xFFA040)],
    startPoint: .bottomLeading, endPoint: .topTrailing)
  /// The neutral shadow under the trip cards' photo stacks (share cards only).
  static let shadow = Color(red: 20 / 255, green: 20 / 255, blue: 30 / 255)
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

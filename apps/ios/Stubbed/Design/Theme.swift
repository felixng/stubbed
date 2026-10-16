import SwiftUI
import UIKit

/// The web's design tokens (apps/web/src/app/globals.css), so both apps
/// look the same. Each colour has its light and dark value; the app is
/// light-only for now (owner's call, like the web), set in StubbedApp.
enum Palette {
  static let background = Color(light: 0xFFF9F6, dark: 0x000000)
  static let surface = Color(light: 0xFFFFFF, dark: 0x1C1C1E)
  static let fill = Color(light: 0xFFEBE3, dark: 0x2C2C2E)
  static let label = Color(light: 0x1F1210, dark: 0xFFFFFF)
  static let labelSecondary = Color(light: 0x5E4039, dark: 0xAEAEB2)
  static let separator = Color(light: 0xF9E0D6, dark: 0x38383A)
  static let outline = Color(light: 0x98695B, dark: 0x7C7C82)
  static let tint = Color(light: 0xFF7A5C, dark: 0xFF6B4A)
  static let tintPressed = Color(light: 0xF2603F, dark: 0xFF8A70)
  static let tintText = Color(light: 0xB33A19, dark: 0xFF6B4A)
  static let tintFill = Color(light: 0xFFE0D5, dark: 0x3D1A11)
  static let onTint = Color(light: 0x1F1210, dark: 0x000000)
  static let star = Color(light: 0xB96F00, dark: 0xFFD60A)
  static let destructive = Color(light: 0x9E1B2C, dark: 0xFF9F0A)
  static let shadow = Color(red: 120 / 255, green: 50 / 255, blue: 30 / 255)
}

/// Corner radii from the web: posters, cards and inputs, sheets.
enum Radius {
  static let sm: CGFloat = 8
  static let md: CGFloat = 12
  static let lg: CGFloat = 20
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

/// The web's type scale is the iOS text styles at default size, with titles
/// bold, so these follow Dynamic Type.
extension Font {
  static let stubLargeTitle = Font.largeTitle.bold()
  static let stubTitle = Font.title.bold()
  static let stubTitle2 = Font.title2.bold()
  static let stubHeadline = Font.headline
  static let stubBody = Font.body
  static let stubSubheadline = Font.subheadline
  static let stubFootnote = Font.footnote
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
  /// continuous corners, a hairline border, no shadow.
  func groupedCard() -> some View {
    self
      .background(Color(.secondarySystemGroupedBackground), in: Grouped.shape)
      .clipShape(Grouped.shape)
      .overlay(Grouped.shape.strokeBorder(Color(.separator).opacity(0.35), lineWidth: 0.5))
  }

  /// Older name for `groupedCard()`, kept while screens move over.
  func cardStyle() -> some View { groupedCard() }

  /// Highlights a tappable row while it's pressed, like a list row.
  func pressableRow() -> some View { buttonStyle(PressableRowStyle()) }
}

/// A row or card that dims to the system fill while pressed.
struct PressableRowStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .contentShape(.rect)
      .background(configuration.isPressed ? Color(.systemFill) : .clear)
      .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
  }
}

/// The trailing chevron on tappable rows and cards.
struct RowChevron: View {
  var body: some View {
    Image(systemName: "chevron.right")
      .font(.footnote.weight(.semibold))
      .foregroundStyle(.tertiary)
      .accessibilityHidden(true)
  }
}

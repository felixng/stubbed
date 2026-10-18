import SwiftUI

/// A labelled form field like the web's: label (with "(optional)"), an
/// optional character counter, the control, then a hint or error line.
struct FormField<Control: View>: View {
  let label: String
  var optional = false
  var counter: String?
  var message: String?
  var isError = false
  @ViewBuilder var control: Control

  var body: some View {
    VStack(alignment: .leading, spacing: Space.s) {
      HStack(alignment: .firstTextBaseline) {
        Text(label).foregroundStyle(.primary)
          + Text(optional ? " (optional)" : "").fontWeight(.regular).foregroundStyle(.secondary)
        Spacer()
        if let counter {
          Text(counter)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .monospacedDigit()
        }
      }
      .font(.subheadline.weight(.medium))
      .accessibilityHidden(true)

      control
        .accessibilityLabel(label)

      if let message {
        Text(message)
          .font(.footnote)
          .foregroundStyle(isError ? Color.red : Color.secondary)
      }
    }
  }
}

extension View {
  /// A text field outside a Form: the grouped row background, 12pt
  /// continuous corners and a hairline border.
  func fieldStyle(minHeight: CGFloat = 50) -> some View {
    self
      .font(.body)
      .foregroundStyle(.primary)
      .padding(.horizontal, Space.l)
      .frame(minHeight: minHeight)
      .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: Radius.md, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
          .strokeBorder(Color(.separator).opacity(0.35), lineWidth: 0.5))
  }
}

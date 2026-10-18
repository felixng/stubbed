import SwiftUI
import UIKit

/// Half-star rating (0.5–5): tap or drag across the stars; tap the value
/// already set to clear it. VoiceOver: an adjustable control stepping by half
/// a star, read as "3.5 stars".
struct RatingInput: View {
  @Binding var value: Double?
  var size: CGFloat = 36

  /// The value when the finger went down, and whether it has since moved
  /// to another value (a drag) rather than tapping the same one.
  @State private var touching = false
  @State private var startValue: Double?
  @State private var moved = false

  var body: some View {
    HStack(spacing: Space.m) {
      GeometryReader { geometry in
        HStack(spacing: 0) {
          ForEach(0..<5, id: \.self) { i in
            let fill = (value ?? 0) - Double(i)
            Image(systemName: fill >= 1 ? "star.fill" : fill >= 0.5 ? "star.leadinghalf.filled" : "star")
              .font(.system(size: size * 0.85))
              .foregroundStyle(fill >= 0.5 ? Palette.star : Color(.systemGray3))
              .frame(width: size, height: size)
          }
        }
        .contentShape(.rect)
        .gesture(
          DragGesture(minimumDistance: 0)
            .onChanged { drag in
              if !touching {
                touching = true
                startValue = value
                moved = false
              }
              let next = Self.rating(at: drag.location.x, width: geometry.size.width)
              if next != startValue { moved = true }
              if next != value { value = next }
            }
            .onEnded { _ in
              // A tap on the value already set clears it.
              if !moved, startValue != nil { value = nil }
              touching = false
              if value != nil { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
            }
        )
      }
      .frame(width: size * 5, height: size)

      Text(value.map { "\($0.formatted()) / 5" } ?? "No rating")
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .monospacedDigit()
    }
    .frame(minHeight: Space.touch)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Rating")
    .accessibilityValue(Self.label(value))
    .accessibilityAdjustableAction { direction in
      switch direction {
      case .increment: value = min(5, (value ?? 0) + 0.5)
      case .decrement: value = (value ?? 0) <= 0.5 ? nil : (value ?? 0) - 0.5
      @unknown default: break
      }
    }
  }

  /// The half step under a point: 0.5 at the far left, 5 at the right.
  static func rating(at x: CGFloat, width: CGFloat) -> Double {
    let clamped = min(max(0, x), width)
    return max(0.5, (Double(clamped / width) * 10).rounded(.up) / 2)
  }

  static func label(_ value: Double?) -> String {
    guard let value else { return "No rating" }
    return "\(value.formatted()) \(value == 1 ? "star" : "stars")"
  }
}

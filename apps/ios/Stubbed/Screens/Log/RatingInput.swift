import SwiftUI

/// Half-star rating (0.5–5): tap or drag across the stars; tap the value
/// already set to clear it. VoiceOver: an adjustable control stepping by half
/// a star, read as "3.5 stars".
struct RatingInput: View {
  @Binding var value: Double?
  var size: CGFloat = 36

  @ScaledMetric(relativeTo: .body) private var scale: CGFloat = 1
  /// Lock the direction once a drag begins so vertical Form scrolling never rates a show.
  @GestureState private var horizontalDrag: Bool? = nil

  var body: some View {
    HStack {
      GeometryReader { geometry in
        let starSize = min(size * scale, geometry.size.width / 5)
        HStack(spacing: 0) {
          ForEach(0..<5, id: \.self) { i in
            let fill = (value ?? 0) - Double(i)
            Image(systemName: fill >= 1 ? "star.fill" : fill >= 0.5 ? "star.leadinghalf.filled" : "star")
              .font(.system(size: starSize * 0.85))
              .foregroundStyle(fill >= 0.5 ? Palette.star : Color(.systemGray3))
              .frame(width: starSize, height: starSize)
          }
        }
        .frame(maxHeight: .infinity)
        .contentShape(.rect)
        .gesture(SpatialTapGesture().onEnded { tap in
          let next = Self.rating(at: tap.location.x, width: geometry.size.width)
          value = value == next ? nil : next
        })
        .simultaneousGesture(
          DragGesture(minimumDistance: 12)
            .updating($horizontalDrag) { drag, direction, _ in
              if direction == nil {
                direction = abs(drag.translation.width) > abs(drag.translation.height)
              }
            }
            .onChanged { drag in
              guard horizontalDrag ?? (abs(drag.translation.width) > abs(drag.translation.height)) else { return }
              value = Self.rating(at: drag.location.x, width: geometry.size.width)
            }
        )
      }
      .frame(maxWidth: size * scale * 5)
      .frame(height: size * scale)
      Spacer(minLength: 0)
    }
    .frame(minHeight: Space.touch)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Rating")
    .accessibilityValue(Self.label(value))
    .sensoryFeedback(.selection, trigger: value)
    .accessibilityAction(named: "Clear rating") { value = nil }
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

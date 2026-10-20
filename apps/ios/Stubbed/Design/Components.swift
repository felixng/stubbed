import SwiftUI

/// "stubbed" in lowercase, heavy, tight tracking, in `label`, never the tint.
/// VoiceOver reads "Stubbed". Matches the web's Wordmark.
struct Wordmark: View {
  var size: CGFloat = 28

  var body: some View {
    Text(verbatim: "stubbed")
      .font(.system(size: max(16, size), weight: .heavy))
      .tracking(-0.045 * max(16, size))
      .foregroundStyle(.primary)
      .accessibilityLabel("Stubbed")
  }
}

/// Five stars in half steps, read-only. Filled stars use `star`, empty ones
/// `outline`. Never a bare number.
struct RatingStars: View {
  let value: Double
  var size: CGFloat = 16
  /// Grows and shrinks the stars with the person's text size.
  @ScaledMetric(relativeTo: .body) private var scale: CGFloat = 1

  var body: some View {
    let rating = min(5, max(0, value))
    HStack(spacing: 2) {
      ForEach(0..<5, id: \.self) { i in
        let fill = rating - Double(i)
        Image(systemName: fill >= 1 ? "star.fill" : fill >= 0.5 ? "star.leadinghalf.filled" : "star")
          .font(.system(size: size * scale))
          .foregroundStyle(fill >= 0.5 ? Palette.star : Color(.systemGray3))
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Rated \(rating.formatted()) out of 5")
  }
}

/// Round avatar: the profile photo, or the first letter of the name on
/// `tint-fill` when there isn't one.
struct Avatar: View {
  let name: String
  let url: URL?
  let size: CGFloat

  var body: some View {
    Group {
      if let url {
        AsyncImage(url: url) { image in
          image.resizable().scaledToFill()
        } placeholder: {
          Color(.systemFill)
        }
      } else {
        Text(String(name.drop(while: { $0 == "@" }).prefix(1)).uppercased())
          .font(.system(size: size * 0.42, weight: .bold))
          .foregroundStyle(Palette.tintText)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(Palette.tintFill)
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .accessibilityHidden(true)
  }
}

/// A 2:3 poster; with no image, the show's initials in `outline` on `fill`.
struct Poster: View {
  let title: String
  var url: URL?
  var width: CGFloat = 56
  /// 2:3 unless set (the feed's stub thumbnail is 48×64).
  var height: CGFloat?

  var body: some View {
    Group {
      if let url {
        AsyncImage(url: url) { image in
          image.resizable().scaledToFill()
        } placeholder: {
          Color(.systemFill)
        }
      } else {
        Text(Self.initials(title))
          .font(.system(size: width * 0.39, weight: .bold))
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(Color(.tertiarySystemFill))
      }
    }
    .frame(width: width, height: height ?? width * 1.5)
    .clipShape(.rect(cornerRadius: Radius.sm, style: .continuous))
    .accessibilityHidden(true)
  }

  static func initials(_ title: String) -> String {
    title.split(whereSeparator: \.isWhitespace).prefix(2).compactMap(\.first).map(String.init).joined()
  }
}

/// The body of a screen (or section) with nothing in it yet: a system
/// `ContentUnavailableView` with an SF Symbol.
struct EmptyState<Content: View>: View {
  let title: String
  var systemImage = "theatermasks"
  @ViewBuilder var content: Content

  var body: some View {
    ContentUnavailableView {
      Label(title, systemImage: systemImage)
    } description: {
      VStack(spacing: Space.s) { content }
    }
    .padding(.vertical, Space.l)
  }
}

/// Grey placeholder rows in the shape of the real ones, for a list's first
/// load (no spinner over the screen).
struct PlaceholderRows: View {
  var count = 4

  var body: some View {
    Section {
      ForEach(0..<count, id: \.self) { _ in
        HStack(spacing: Space.m) {
          Circle().fill(Color(.systemFill)).frame(width: 40, height: 40)
          VStack(alignment: .leading, spacing: 4) {
            Text(verbatim: "Placeholder title").font(.headline)
            Text(verbatim: "Placeholder detail line").font(.subheadline)
          }
        }
        .redacted(reason: .placeholder)
        .accessibilityHidden(true)
      }
    }
  }
}

/// A centred spinner while a section loads.
struct LoadingText: View {
  var body: some View {
    ProgressView()
      .frame(maxWidth: .infinity, minHeight: 120)
  }
}

#Preview {
  List {
    Wordmark(size: 30)
    RatingStars(value: 3.5)
    Avatar(name: "felix", url: nil, size: 48)
    Poster(title: "Operation Mincemeat", width: 48, height: 64)
    EmptyState(title: "Nothing here yet") { Text("Track a show and it appears here.") }
    PlaceholderRows()
  }
}

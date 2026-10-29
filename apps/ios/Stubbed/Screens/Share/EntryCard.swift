import SwiftUI
import UIKit

/// What an entry's share card shows. The counts come from
/// `entry_card_stats` in Postgres, so they match the web's cards.
struct EntryCardData: Hashable, Sendable {
  var title: String
  /// Venue name, for the "Nth visit" stat; nil without a venue.
  var venue: String?
  /// "Belasco Theatre, New York", or "" with no venue.
  var whereText: String
  /// "3 Oct 2026"
  var date: String
  var year: Int
  var rating: Double?
  var showOfYear: Int
  var venueVisit: Int
  var timesSeen: Int
  var handle: String?
}

/// The entry card designs, in the web's order (apps/web/src/lib/share-card.ts):
/// stats across the top, or the name alone (owner, 2026-10-29). Both keep the
/// middle of the photo clear, and either can hide the rating.
enum EntryCardDesign: String, CaseIterable, Identifiable, Sendable {
  case stats
  case name

  var id: String { rawValue }

  var name: String {
    switch self {
    case .stats: "Stats"
    case .name: "Name only"
    }
  }

  /// Off by default for 2 stars or below, and when there's no rating (the
  /// web's `showsRatingByDefault`).
  static func showsRating(_ rating: Double?) -> Bool { (rating ?? 0) > 2 }
}

/// Stubbed's Instagram handle (the web's `CARD_DOMAIN`): the share screen
/// asks you to tag it, and trip cards show it under the wordmark. Entry
/// cards leave it off (owner, 2026-10-29).
let cardDomain = "@getstubbed.app"

/// Fixed colours from the card designs: cards are always dark, whatever the
/// app's theme.
enum CardInk {
  static let coral = Color(red: 1, green: 90 / 255, blue: 90 / 255)
  static let star = Color(red: 1, green: 160 / 255, blue: 64 / 255)
  static let secondary = Color(red: 174 / 255, green: 174 / 255, blue: 178 / 255)
  static let softWhite = Color.white.opacity(0.9)
  static let ground = Color(red: 28 / 255, green: 28 / 255, blue: 30 / 255)
  static let rule = Color(red: 56 / 255, green: 56 / 255, blue: 58 / 255)
}

/// 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st.
func ordinal(_ n: Int) -> String {
  let rem100 = n % 100
  if (11...13).contains(rem100) { return "\(n)th" }
  switch n % 10 {
  case 1: return "\(n)st"
  case 2: return "\(n)nd"
  case 3: return "\(n)rd"
  default: return "\(n)th"
  }
}

/// One entry card, laid out in the designs' 540pt square. Render it with
/// `ShareCards.render` for the 1080px image. `transparent` drops the photo
/// and shading (text only, with shadows), for laying over your own story.
/// Pass `data` with `rating` nil to hide the rating.
struct EntryCardView: View {
  let design: EntryCardDesign
  let data: EntryCardData
  let photo: UIImage?
  var transparent = false

  static let size: CGFloat = 540
  private let side: CGFloat = 28

  var body: some View {
    ZStack(alignment: .topLeading) {
      if !transparent { background }
      VStack(alignment: .leading, spacing: 0) {
        if design == .stats { stats }
        Spacer(minLength: 0)
        if design == .stats {
          CardTitle(text: data.title, size: 26, lineHeight: 30, width: Self.size - side * 2, maxLines: 1)
            .padding(.bottom, 10)
        } else {
          CardTitle(text: data.title, size: 36, lineHeight: 40, width: Self.size - side * 2)
            .padding(.bottom, 12)
          if let rating = data.rating {
            CardStars(value: rating, size: 24, gap: 3, outline: .white.opacity(0.75))
              .padding(.bottom, 12)
          }
        }
        footer
      }
      .padding(.horizontal, side)
      .padding(.bottom, 26)
      .cardTextShadow(true)
    }
    .frame(width: Self.size, height: Self.size)
    .clipShape(.rect(cornerRadius: transparent ? 0 : 32))
    .environment(\.colorScheme, .dark)
  }

  /// Shade only where there's text: a band at the top behind the stats, and
  /// the bottom quarter behind the name and logo.
  private var background: some View {
    ZStack {
      CardBackground(photo: photo, focusY: 0.4)
      VStack(spacing: 0) {
        if design == .stats {
          LinearGradient(colors: [.black.opacity(0.55), .black.opacity(0)], startPoint: .top, endPoint: .bottom)
            .frame(height: 150)
        }
        Spacer(minLength: 0)
        LinearGradient(colors: [.black.opacity(0), .black.opacity(0.75)], startPoint: .top, endPoint: .bottom)
          .frame(height: Self.size - 360)
      }
    }
  }

  /// Show of the year, the venue visit (or times seen with no venue), then
  /// the rating, or times seen when it's hidden.
  private var stats: some View {
    var columns: [(label: String, value: String?, color: Color)] = [
      ("Show of \(String(data.year))", ordinal(data.showOfYear), CardInk.coral)
    ]
    if let venue = data.venue {
      columns.append((venue, "\(ordinal(data.venueVisit)) visit", .white))
    } else {
      columns.append(("Seen", "\(ordinal(data.timesSeen)) time", .white))
    }
    if data.rating != nil {
      columns.append(("Rating", nil, .white))
    } else if data.venue != nil {
      columns.append(("Seen", "\(ordinal(data.timesSeen)) time", .white))
    }
    return HStack(spacing: 0) {
      ForEach(Array(columns.enumerated()), id: \.offset) { _, column in
        VStack(spacing: 4) {
          Text(column.label)
            .font(.system(size: 20, weight: .medium))
            .tracking(-0.2)
            .foregroundStyle(CardInk.softWhite)
            .lineLimit(1)
            .frame(height: 26)
          if let value = column.value {
            Text(value)
              .font(.system(size: 30, weight: .bold))
              .tracking(0.2)
              .foregroundStyle(column.color)
              .lineLimit(1)
              .minimumScaleFactor(0.7)
              .frame(height: 36)
          } else if let rating = data.rating {
            CardStars(value: rating, size: 24, gap: 3, outline: .white.opacity(0.75))
              .frame(height: 36)
          }
        }
        .padding(.horizontal, 6)
        .frame(maxWidth: .infinity)
      }
    }
    .padding(.horizontal, 20 - side)
    .padding(.top, 30)
  }

  /// The logo (ticket mark and wordmark), and the @handle on the right.
  private var footer: some View {
    HStack(alignment: .center) {
      HStack(spacing: 36 * 0.28) {
        Image("BrandMark")
          .resizable()
          .scaledToFit()
          .frame(height: 36 * 1.05)
        Text(verbatim: "stubbed")
          .font(.system(size: 36, weight: .heavy))
          .tracking(-0.045 * 36)
          .foregroundStyle(.white)
      }
      Spacer(minLength: 12)
      if let handle = data.handle {
        Text(verbatim: "@\(handle)")
          .font(.system(size: 24, weight: .medium))
          .tracking(-0.3)
          .foregroundStyle(.white)
          .lineLimit(1)
          .frame(maxWidth: 200, alignment: .trailing)
      }
    }
    .frame(height: 44)
  }
}

/// The photo, filling the square (cropped, centred across, `focusY` down).
/// No photo: a dark ground with a faint coral glow, so the text still reads.
struct CardBackground: View {
  let photo: UIImage?
  let focusY: CGFloat

  var body: some View {
    GeometryReader { geo in
      ZStack {
        CardInk.ground
        if let photo {
          let scale = max(geo.size.width / photo.size.width, geo.size.height / photo.size.height)
          let w = photo.size.width * scale
          let h = photo.size.height * scale
          Image(uiImage: photo)
            .resizable()
            .frame(width: w, height: h)
            .position(x: geo.size.width / 2, y: (geo.size.height - h) * focusY + h / 2)
        } else {
          RadialGradient(
            colors: [CardInk.coral.opacity(0.35), CardInk.coral.opacity(0)],
            center: UnitPoint(x: 0.7, y: 0.25), startRadius: 0, endRadius: geo.size.width * 0.8)
        }
      }
    }
  }
}

/// The title in up to two lines, shrinking for very long titles, then an
/// ellipsis as a last resort.
struct CardTitle: View {
  let text: String
  let size: CGFloat
  let lineHeight: CGFloat
  let width: CGFloat
  var maxLines = 2

  var body: some View {
    let fitted = Self.fit(text, size: size, width: width, maxLines: maxLines)
    Text(text)
      .font(.system(size: fitted, weight: .bold))
      .tracking(fitted * 0.01)
      .lineSpacing(lineHeight / size * fitted - fitted * 1.2)
      .foregroundStyle(.white)
      .lineLimit(maxLines)
      .truncationMode(.tail)
      .frame(width: width, alignment: .leading)
      .fixedSize(horizontal: false, vertical: true)
  }

  /// The largest size, down to 70%, at which the title fits in `maxLines`.
  static func fit(_ text: String, size: CGFloat, width: CGFloat, maxLines: Int = 2) -> CGFloat {
    var s = size
    while s > size * 0.7 {
      let font = UIFont.systemFont(ofSize: s, weight: .bold)
      if lines(text, font: font, width: width) <= maxLines { return s }
      s -= 2
    }
    return size * 0.7
  }

  static func lines(_ text: String, font: UIFont, width: CGFloat) -> Int {
    var count = 1
    var line = ""
    for word in text.split(whereSeparator: \.isWhitespace) {
      let next = line.isEmpty ? String(word) : "\(line) \(word)"
      if !line.isEmpty, (next as NSString).size(withAttributes: [.font: font]).width > width {
        count += 1
        line = String(word)
      } else {
        line = next
      }
    }
    return count
  }
}

/// The designs' star (24pt viewBox), as a shape.
struct CardStar: Shape {
  func path(in rect: CGRect) -> Path {
    let points: [CGPoint] = [
      (12, 2.5), (14.9, 8.6), (21.5, 9.4), (16.6, 14), (17.9, 20.6), (12, 17.3), (6.1, 20.6), (7.4, 14), (2.5, 9.4),
      (9.1, 8.6),
    ].map { CGPoint(x: $0.0 / 24 * rect.width + rect.minX, y: $0.1 / 24 * rect.height + rect.minY) }
    var path = Path()
    path.addLines(points)
    path.closeSubpath()
    return path
  }
}

/// Half-star rating: outline stars, with filled ones clipped to the value.
struct CardStars: View {
  let value: Double
  let size: CGFloat
  let gap: CGFloat
  let outline: Color

  var body: some View {
    HStack(spacing: gap) {
      ForEach(0..<5, id: \.self) { i in
        let fill = min(max(value - Double(i), 0), 1)
        ZStack(alignment: .leading) {
          CardStar().stroke(outline, style: StrokeStyle(lineWidth: 1.5 * size / 24, lineJoin: .round))
          CardStar()
            .fill(CardInk.star)
            .overlay(CardStar().stroke(CardInk.star, style: StrokeStyle(lineWidth: 1.5 * size / 24, lineJoin: .round)))
            .mask(alignment: .leading) { Rectangle().frame(width: size * fill) }
        }
        .frame(width: size, height: size)
      }
    }
  }
}

extension View {
  /// The cards' text shadow, so text reads on any photo.
  @ViewBuilder func cardTextShadow(_ on: Bool) -> some View {
    if on { shadow(color: .black.opacity(0.55), radius: 4, y: 0.5) } else { self }
  }
}

#Preview {
  let data = EntryCardData(
    title: "Operation Mincemeat", venue: "Golden Theatre", whereText: "Golden Theatre, New York", date: "6 Oct 2026",
    year: 2026, rating: 4.5, showOfYear: 14, venueVisit: 2, timesSeen: 3, handle: "felix")
  ScrollView {
    VStack {
      ForEach(EntryCardDesign.allCases) { design in
        EntryCardView(design: design, data: data, photo: nil).scaleEffect(0.6).frame(width: 324, height: 324)
      }
    }
  }
}

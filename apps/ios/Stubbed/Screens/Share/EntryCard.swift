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

/// The entry card designs, in the web's order (apps/web/src/lib/share-card.ts).
enum EntryCardDesign: String, CaseIterable, Identifiable, Sendable {
  case square
  case hevyVenue = "hevy-venue"
  case hevySeen = "hevy-seen"

  var id: String { rawValue }

  var name: String {
    switch self {
    case .square: "Photo"
    case .hevyVenue: "Photo with stats"
    case .hevySeen: "Photo, times seen"
    }
  }
}

/// Shown small under the wordmark on every card (the web's `CARD_DOMAIN`),
/// so a shared image leads back.
let cardDomain = "@getstubbed.app"

/// Fixed colours from the card designs: cards are always dark, whatever the
/// app's theme.
enum CardInk {
  static let coral = Color(red: 1, green: 107 / 255, blue: 74 / 255)
  static let star = Color(red: 1, green: 214 / 255, blue: 10 / 255)
  static let secondary = Color(red: 174 / 255, green: 174 / 255, blue: 178 / 255)
  static let softWhite = Color.white.opacity(0.85)
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
struct EntryCardView: View {
  let design: EntryCardDesign
  let data: EntryCardData
  let photo: UIImage?
  var transparent = false

  static let size: CGFloat = 540

  var body: some View {
    ZStack {
      switch design {
      case .square: square
      case .hevyVenue: hevy(middle: .venue)
      case .hevySeen: hevy(middle: .seen)
      }
    }
    .frame(width: Self.size, height: Self.size)
    .environment(\.colorScheme, .dark)
  }

  // MARK: - "Square · single, full photo"

  private var square: some View {
    let pad: CGFloat = 28
    return ZStack(alignment: .bottomLeading) {
      if !transparent {
        CardBackground(photo: photo, focusY: 0.5)
        LinearGradient(
          stops: [
            .init(color: .black.opacity(0), location: 0), .init(color: .black.opacity(0.78), location: 0.5),
            .init(color: .black, location: 1),
          ], startPoint: .top, endPoint: .bottom
        )
        .frame(height: Self.size - 150)
      }
      VStack(alignment: .leading, spacing: 0) {
        CardTitle(text: data.title, size: 36, lineHeight: 40, width: Self.size - pad * 2)
          .padding(.bottom, 4)
        Text(meta)
          .font(.system(size: 14))
          .tracking(-0.17)
          .foregroundStyle(CardInk.secondary)
          .lineLimit(1)
          .frame(height: 19, alignment: .leading)
          .padding(.bottom, 10)
        HStack(alignment: .center, spacing: 0) {
          if let rating = data.rating {
            CardStars(value: rating, size: 22, gap: 3, outline: Color(red: 124 / 255, green: 124 / 255, blue: 130 / 255))
            Spacer(minLength: 8)
          }
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(ordinal(data.showOfYear))
              .font(.system(size: 17, weight: .semibold))
              .tracking(-0.4)
              .foregroundStyle(CardInk.coral)
            Text("show of \(String(data.year))")
              .font(.system(size: 13))
              .foregroundStyle(CardInk.secondary)
          }
          if data.rating == nil { Spacer(minLength: 0) }
        }
        .frame(height: 22)
        .padding(.bottom, 15)
        CardInk.rule.frame(height: 1).padding(.bottom, 9)
        HStack {
          Text(verbatim: "stubbed")
            .font(.system(size: 18, weight: .heavy))
            .tracking(-0.81)
            .foregroundStyle(.white)
          Spacer()
          if let handle = data.handle {
            Text(verbatim: "@\(handle)")
              .font(.system(size: 13))
              .tracking(-0.08)
              .foregroundStyle(CardInk.secondary)
          }
        }
        .frame(height: 18)
        Text(verbatim: cardDomain)
          .font(.system(size: 10, weight: .medium))
          .foregroundStyle(CardInk.secondary)
          .frame(height: 12)
      }
      .padding([.horizontal, .top], pad)
      .padding(.bottom, pad - 7)
      .cardTextShadow(transparent)
    }
    .clipShape(.rect(cornerRadius: transparent ? 0 : 20))
  }

  // MARK: - "Hevy-style · photo" (venue visits) and "· photo, seen before"

  private enum Middle { case venue, seen }

  private func hevy(middle: Middle) -> some View {
    let side: CGFloat = 24
    var stats: [(label: String, value: String?, color: Color)] = [
      ("Show of \(String(data.year))", ordinal(data.showOfYear), CardInk.coral)
    ]
    if middle == .venue, let venue = data.venue {
      stats.append((venue, "\(ordinal(data.venueVisit)) visit", .white))
    } else {
      stats.append(("Time seen", ordinal(data.timesSeen), .white))
    }
    if data.rating != nil { stats.append(("Rating", nil, .white)) }

    return ZStack(alignment: .topLeading) {
      if !transparent {
        CardBackground(photo: photo, focusY: middle == .seen ? 0.4 : 0.35)
        VStack(spacing: 0) {
          LinearGradient(colors: [.black.opacity(0.6), .black.opacity(0)], startPoint: .top, endPoint: .bottom)
            .frame(height: 170)
          Spacer(minLength: 0)
          LinearGradient(colors: [.black.opacity(0), .black.opacity(0.82)], startPoint: .top, endPoint: .bottom)
            .frame(height: Self.size - 270)
        }
      }
      VStack(spacing: 0) {
        HStack(spacing: 0) {
          ForEach(Array(stats.enumerated()), id: \.offset) { _, stat in
            VStack(spacing: 4) {
              Text(stat.label)
                .font(.system(size: 15))
                .tracking(-0.15)
                .foregroundStyle(CardInk.softWhite)
                .lineLimit(1)
                .frame(height: 20)
              if let value = stat.value {
                Text(value)
                  .font(.system(size: 24, weight: .bold))
                  .tracking(0.24)
                  .foregroundStyle(stat.color)
                  .lineLimit(1)
                  .frame(height: 28)
              } else if let rating = data.rating {
                CardStars(value: rating, size: 20, gap: 2, outline: .white.opacity(0.75))
                  .frame(height: 28)
              }
            }
            .padding(.horizontal, 6)
            .frame(maxWidth: .infinity)
          }
        }
        .padding(.horizontal, side)
        .padding(.top, 28)
        Spacer(minLength: 0)
        VStack(alignment: .leading, spacing: 0) {
          CardTitle(text: data.title, size: 34, lineHeight: 38, width: Self.size - (side + 4) * 2)
            .padding(.bottom, 2)
          Text(meta)
            .font(.system(size: 15))
            .tracking(-0.18)
            .foregroundStyle(CardInk.softWhite)
            .lineLimit(1)
            .frame(height: 20, alignment: .leading)
            .padding(.bottom, 6)
          HStack {
            Text(verbatim: "stubbed")
              .font(.system(size: 28, weight: .heavy))
              .tracking(-1.26)
              .foregroundStyle(.white)
            Spacer()
            if let handle = data.handle {
              Text(verbatim: "@\(handle)")
                .font(.system(size: 20))
                .tracking(-0.32)
                .foregroundStyle(CardInk.softWhite)
            }
          }
          .frame(height: 28)
          Text(verbatim: cardDomain)
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(CardInk.softWhite)
            .frame(height: 14)
        }
        .padding(.horizontal, side + 4)
        .padding(.bottom, 20)
      }
      .cardTextShadow(true)
    }
    .clipShape(.rect(cornerRadius: transparent ? 0 : 32))
  }

  private var meta: String { [data.whereText, data.date].filter { !$0.isEmpty }.joined(separator: " · ") }
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

  var body: some View {
    let fitted = Self.fit(text, size: size, width: width)
    Text(text)
      .font(.system(size: fitted, weight: .bold))
      .tracking(fitted * 0.01)
      .lineSpacing(lineHeight / size * fitted - fitted * 1.2)
      .foregroundStyle(.white)
      .lineLimit(2)
      .truncationMode(.tail)
      .frame(width: width, alignment: .leading)
      .fixedSize(horizontal: false, vertical: true)
  }

  /// The largest size, down to 70%, at which the title wraps to two lines.
  static func fit(_ text: String, size: CGFloat, width: CGFloat) -> CGFloat {
    var s = size
    while s > size * 0.7 {
      let font = UIFont.systemFont(ofSize: s, weight: .bold)
      if lines(text, font: font, width: width) <= 2 { return s }
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

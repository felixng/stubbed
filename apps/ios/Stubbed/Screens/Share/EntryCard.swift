import SwiftUI
import UIKit

struct EntryCardData: Hashable, Sendable {
  var title: String
  var venue: String?
  var whereText: String
  var date: String
  var year: Int
  var rating: Double?
  var showOfYear: Int
  var venueVisit: Int
  var timesSeen: Int
  var handle: String?
}

enum EntryCardDesign: String, CaseIterable, Identifiable, Sendable {
  case stats, name, data, encore, overlay, ticket
  case number = "show-number"
  var id: String { rawValue }
  var name: String {
    switch self {
    case .stats: "Data + Photo"
    case .name: "Rating + Photo"
    case .data: "Data"
    case .encore: "Encore"
    case .number: "Show number"
    case .overlay: "Show overlay"
    case .ticket: "Ticket stub"
    }
  }
  var isPhoto: Bool { self == .stats || self == .name }
  static func available(photo: Bool, rating: Double?, timesSeen: Int) -> [Self] {
    (photo ? [.stats] + (rating != nil ? [.name] : []) : [])
      + [.data, .encore, .number, .overlay, .ticket]
  }
}

let cardDomain = "@getstubbed.app"
enum CardInk {
  static let coral = Color(red: 1, green: 90 / 255, blue: 90 / 255)
  static let star = Color(red: 1, green: 160 / 255, blue: 64 / 255)
  static let secondary = Color(red: 174 / 255, green: 174 / 255, blue: 178 / 255)
  static let softWhite = Color.white.opacity(0.9)
  static let ground = Color(red: 28 / 255, green: 28 / 255, blue: 30 / 255)
  static let rule = Color(red: 56 / 255, green: 56 / 255, blue: 58 / 255)
}
func ordinal(_ n: Int) -> String {
  if (11...13).contains(n % 100) { return "\(n)th" }
  switch n % 10 {
  case 1: return "\(n)st"
  case 2: return "\(n)nd"
  case 3: return "\(n)rd"
  default: return "\(n)th"
  }
}

struct EntryCardView: View {
  let design: EntryCardDesign
  let data: EntryCardData
  let photo: UIImage?
  var appearance: ShareAppearance = .standard
  static let size: CGFloat = 540
  private var ink: Color { design.isPhoto ? .white : appearance.foreground }
  private var metrics: [(String, String)] {
    var result = [("Show of \(data.year)", ordinal(data.showOfYear))]
    if let venue = data.venue { result.append((venue, "\(ordinal(data.venueVisit)) visit")) }
    result.append(("Times seen", String(data.timesSeen)))
    return result
  }
  var body: some View {
    ZStack {
      if design.isPhoto {
        CardBackground(photo: photo, focusY: 0.4)
        VStack {
          if design == .stats {
            LinearGradient(colors: [.black.opacity(0.6), .clear], startPoint: .top, endPoint: .bottom).frame(height: 150)
          }
          Spacer()
          LinearGradient(colors: [.clear, .black.opacity(0.8)], startPoint: .top, endPoint: .bottom).frame(height: 180)
        }
      } else { ShareCardSurface(appearance: appearance) }
      if design == .ticket {
        TicketOverlayCard(data: data, ink: ink)
      } else if design == .overlay {
        ShowOverlayCard(data: data, ink: ink)
      } else {
        VStack(alignment: .leading, spacing: 0) {
          if design == .stats {
            HStack(alignment: .top, spacing: 12) {
              ForEach(Array(metrics.enumerated()), id: \.offset) { _, item in
                VStack(spacing: 6) {
                  Text(item.0).font(.system(size: 17, weight: .medium)).lineLimit(2).frame(height: 42)
                  Text(item.1).font(.system(size: 28, weight: .bold)).lineLimit(1).minimumScaleFactor(0.7)
                }.frame(maxWidth: .infinity)
              }
            }
            Spacer()
          } else if design == .data {
            CardTitle(text: data.title, size: 38, lineHeight: 42, width: 484, ink: ink)
            Spacer(minLength: 20)
            ForEach(Array(metrics.enumerated()), id: \.offset) { _, item in
              VStack(alignment: .leading, spacing: 3) {
                Text(item.0).font(.system(size: 18, weight: .medium)).lineLimit(2)
                Text(item.1).font(.system(size: 42, weight: .bold)).lineLimit(1).minimumScaleFactor(0.65)
              }.padding(.bottom, 20)
            }
            Spacer(minLength: 12)
          } else if !design.isPhoto {
            Text(design == .encore ? (data.timesSeen == 1 ? "First visit" : "Encore") : "My theatre year")
              .font(.system(size: 22, weight: .medium))
            Spacer(minLength: 0)
            CardBadge(value: design == .encore ? "\(data.timesSeen)x" : ordinal(data.showOfYear))
              .frame(maxWidth: .infinity)
            Text(verbatim: design == .encore ? "\(ordinal(data.timesSeen)) time seeing this show" : "Show of \(data.year)")
              .font(.system(size: 20, weight: .medium)).lineLimit(1).minimumScaleFactor(0.7)
            Spacer(minLength: 0)
            CardTitle(text: data.title, size: 30, lineHeight: 34, width: 484, ink: ink)
              .padding(.bottom, 12)
            Spacer(minLength: 0)
          } else { Spacer() }
          if design.isPhoto {
            CardTitle(text: data.title, size: design == .stats ? 28 : 36, lineHeight: 40, width: 484, ink: ink).padding(.bottom, 12)
            if design == .name, let rating = data.rating {
              CardStars(value: rating, size: 30, gap: 4, outline: .white.opacity(0.75)).padding(.bottom, 16)
            }
          }
          CardFooter(handle: data.handle, ink: ink)
        }.foregroundStyle(ink).padding(28).cardTextShadow(design.isPhoto)
      }
    }
    .frame(width: Self.size, height: Self.size)
    .clipShape(.rect(cornerRadius: 32))
    .environment(\.colorScheme, .dark)
  }
}

/// Four equally sized sections, followed by the design system's outline icon.
private struct ShowOverlayCard: View {
  let data: EntryCardData
  let ink: Color
  private let today = Date()

  var body: some View {
    ZStack(alignment: .top) {
      VStack(spacing: 8) {
        section("Show", value: data.title, title: true)
        section("Date", value: today.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).year().locale(Locale(identifier: "en_GB"))))
        section("Seen", value: "\(data.timesSeen) \(data.timesSeen == 1 ? "time" : "times")")
        section(data.year == Calendar.current.component(.year, from: today) ? "This year so far" : "\(data.year) so far",
          value: "\(ordinal(data.showOfYear)) show")
      }.padding(.top, 48)
      Image("BrandMarkOutline").renderingMode(.original).resizable().scaledToFit()
        .frame(width: 58, height: 58 * 673 / 816).padding(.top, 454)
    }
    .foregroundStyle(ink)
    .frame(width: 540, height: 540, alignment: .top)
  }

  private func section(_ label: String, value: String, title: Bool = false) -> some View {
    VStack(spacing: 2) {
      Text(label).font(.system(size: 17, weight: .semibold))
      Text(value).font(.system(size: 36, weight: .bold)).tracking(-0.5)
        .lineLimit(title ? 2 : 1).minimumScaleFactor(0.72)
        .multilineTextAlignment(.center).frame(height: 64, alignment: .top)
    }.frame(width: 400, height: 88, alignment: .top)
  }
}

private struct TicketOverlayCard: View {
  let data: EntryCardData
  let ink: Color
  private let today = Date()

  var body: some View {
    ZStack(alignment: .top) {
      ZStack(alignment: .topLeading) {
        Image("ShareTicketOutline").renderingMode(.template).resizable()
          .frame(width: 480, height: 480 * 388 / 648)
        VStack(alignment: .leading, spacing: 14) {
          Text(data.title).font(.system(size: 30, weight: .bold)).tracking(-0.4)
            .lineLimit(2).minimumScaleFactor(0.73)
            .fixedSize(horizontal: false, vertical: true)
          Text(today, format: .dateTime.weekday(.abbreviated).day().month(.abbreviated).year())
            .font(.system(size: 18, weight: .medium))
        }.frame(width: 368, alignment: .leading).offset(x: 56, y: 44)
        stat("Seen", value: "\(data.timesSeen) \(data.timesSeen == 1 ? "time" : "times")", width: 148)
          .offset(x: 56, y: 194)
        stat(data.year == Calendar.current.component(.year, from: today) ? "This year so far" : "\(data.year) so far",
          value: "\(ordinal(data.showOfYear)) show", width: 168).offset(x: 246, y: 194)

      }
      .foregroundStyle(ink)
      .frame(width: 480, height: 480 * 388 / 648)
      .rotationEffect(.degrees(-7))
      .padding(.top, 96)
      HStack(spacing: 8) {
        Image("BrandMarkOutline").renderingMode(.original).resizable().scaledToFit()
          .frame(width: 48, height: 48 * 673 / 816)
        Text("stubbed").font(.system(size: 30, weight: .heavy)).tracking(-1.35)
          .foregroundStyle(CardInk.coral)
      }.padding(.top, 464)
    }
    .frame(width: 540, height: 540, alignment: .top)
    .environment(\.locale, Locale(identifier: "en_GB"))
  }

  private func stat(_ label: String, value: String, width: CGFloat) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(label).font(.system(size: 14, weight: .semibold))
      Text(value).font(.system(size: 24, weight: .bold)).tracking(-0.3)
        .lineLimit(1).minimumScaleFactor(0.65)
    }.frame(width: width, alignment: .leading)
  }
}

/// A count illustration, not an awarded achievement. The square canvas
/// and footer remain the same as every other sharing design.
struct CardBadge: View {
  let value: String
  var body: some View {
    ZStack {
      HStack(spacing: 42) {
        ribbon.rotationEffect(.degrees(12))
        ribbon.rotationEffect(.degrees(-12))
      }.offset(y: 66)
      Image(systemName: "seal.fill").resizable().scaledToFit()
        .foregroundStyle(CardInk.star).frame(width: 180, height: 180).offset(y: -10)
      Circle().stroke(Color.black.opacity(0.18), lineWidth: 2)
        .frame(width: 132, height: 132).offset(y: -10)
      Text(value).font(.system(size: 48, weight: .heavy)).tracking(-1.5)
        .foregroundStyle(Color(white: 0.12)).lineLimit(1).minimumScaleFactor(0.45)
        .frame(width: 132).offset(y: -10)
    }.frame(width: 220, height: 200)
  }
  private var ribbon: some View {
    UnevenRoundedRectangle(topLeadingRadius: 3, bottomLeadingRadius: 1,
      bottomTrailingRadius: 1, topTrailingRadius: 3)
      .fill(CardInk.coral).frame(width: 36, height: 60)
  }
}
struct CardFooter: View {
  let handle: String?
  var ink: Color = .white
  var body: some View {
    HStack(spacing: 12) {
      HStack(spacing: 8) {
        Image("BrandMark").resizable().scaledToFit().frame(height: 30)
        Text("stubbed").font(.system(size: 30, weight: .heavy)).tracking(-1.35)
      }
      Spacer(minLength: 12)
      if let handle { Text(verbatim: "@\(handle)").font(.system(size: 20, weight: .medium)).lineLimit(1).minimumScaleFactor(0.6) }
    }.foregroundStyle(ink).frame(height: 40)
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
  var ink: Color = .white

  var body: some View {
    let fitted = Self.fit(text, size: size, width: width, maxLines: maxLines)
    Text(text)
      .font(.system(size: fitted, weight: .bold))
      .tracking(fitted * 0.01)
      .lineSpacing(lineHeight / size * fitted - fitted * 1.2)
      .foregroundStyle(ink)
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

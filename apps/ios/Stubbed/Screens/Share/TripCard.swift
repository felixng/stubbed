import SwiftUI
import UIKit

/// A show on a trip's recap card.
struct TripCardShow: Hashable {
  var title: String
  var venue: String?
  /// "Sun 4 Oct"
  var day: String
  var rating: Double?
  var photo: UIImage?
}

/// What a trip's recap cards show, like the web's TripCardData.
struct TripCardData: Hashable {
  var name: String
  /// "4–8 Oct 2026"
  var dates: String
  /// "New York", "3 cities", or nil with no venues.
  var place: String?
  var cities: Int
  var handle: String?
  /// Shows seen, in date order.
  var shows: [TripCardShow]
  var venues: Int
  var average: Double?
}

/// The trip designs, in the web's order (apps/web/src/lib/share-card-trip.ts).
enum TripCardDesign: String, CaseIterable, Identifiable {
  case list = "trip-list"
  case grid = "trip-grid"
  case collage = "trip-collage"
  case square = "trip-square"

  var id: String { rawValue }

  var name: String {
    switch self {
    case .list: "List"
    case .grid: "Photo grid"
    case .collage: "Collage"
    case .square: "Photos"
    }
  }
}

/// One trip card in the designs' 540pt square, with the shared header and
/// footer. List and grid are dark; collage and photos are light.
struct TripCardView: View {
  let design: TripCardDesign
  let data: TripCardData

  private static let w: CGFloat = 540
  private static let pad: CGFloat = 28
  private static let inner = w - pad * 2
  private static let footerMid = w - pad - 9
  private static let footerTop = footerMid - 9
  private static let gap: CGFloat = 16

  struct Ink {
    let ground, surface, fill, label, secondary, separator, outline, accent: Color
    static let dark = Ink(
      ground: .black, surface: rgb(0x1C1C1E), fill: rgb(0x2C2C2E), label: .white, secondary: rgb(0xAEAEB2),
      separator: rgb(0x38383A), outline: rgb(0x7C7C82), accent: CardInk.coral)
    static let light = Ink(
      ground: rgb(0xFFF9F6), surface: .white, fill: rgb(0xFFEBE3), label: rgb(0x1F1210), secondary: rgb(0x5E4039),
      separator: rgb(0xF9E0D6), outline: rgb(0x98695B), accent: rgb(0xB33A19))
  }

  private var ink: Ink { design == .collage || design == .square ? .light : .dark }
  private var shows: [TripCardShow] { data.shows }

  var body: some View {
    ZStack(alignment: .topLeading) {
      ink.ground
      switch design {
      case .list: list
      case .grid: grid
      case .collage: collage
      case .square: squareGrid
      }
      footer
    }
    .frame(width: Self.w, height: Self.w)
    .clipShape(.rect(cornerRadius: 20))
    .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(ink.separator, lineWidth: 1))
  }

  // MARK: - Shared header and footer

  /// Trip name, then "New York · 4–8 Oct 2026 · 4 shows" with the place in
  /// the accent colour. 55pt tall from the top padding.
  private var header: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(data.name)
        .font(.system(size: 30, weight: .bold))
        .tracking(0.36)
        .foregroundStyle(ink.label)
        .lineLimit(1)
        .frame(height: 34, alignment: .leading)
      (Text(data.place.map { "\($0) " } ?? "").font(.system(size: 14, weight: .semibold)).foregroundStyle(ink.accent)
        + Text("\(data.place != nil ? "· " : "")\(data.dates) · \(plural(shows.count, "show"))")
        .font(.system(size: 14)).foregroundStyle(ink.secondary))
        .tracking(-0.17)
        .lineLimit(1)
        .frame(height: 19, alignment: .leading)
    }
    .frame(width: Self.inner, alignment: .leading)
    .offset(x: Self.pad, y: Self.pad)
  }

  private static let headerBottom = pad + 34 + 2 + 19

  /// Wordmark with the domain under it, around `footerMid` (the web's
  /// `drawFooter`), so the content area stays the same.
  private var footer: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack {
        Text(verbatim: "stubbed")
          .font(.system(size: 18, weight: .heavy))
          .tracking(-0.81)
          .foregroundStyle(ink.label)
        Spacer()
        if let handle = data.handle {
          Text(verbatim: "@\(handle)")
            .font(.system(size: 13))
            .tracking(-0.08)
            .foregroundStyle(ink.secondary)
        }
      }
      .frame(height: 18)
      Text(verbatim: cardDomain)
        .font(.system(size: 10, weight: .medium))
        .foregroundStyle(ink.secondary)
        .frame(height: 12)
    }
    .frame(width: Self.inner, alignment: .leading)
    .offset(x: Self.pad, y: Self.footerMid - 14)
  }

  // MARK: - List

  /// Up to 4 shows get photo rows; 5–6 compact rows; past 6, five rows and
  /// "+ N more shows".
  private var list: some View {
    let top = Self.headerBottom + Self.gap
    let bottom = Self.footerTop - Self.gap
    let compact = shows.count > 4
    let rows = shows.count > 6 ? Array(shows.prefix(5)) : shows
    let more = shows.count - rows.count
    let rowH: CGFloat = compact ? 56 : 72
    let moreH: CGFloat = more > 0 ? 40 : 0
    let panelH = CGFloat(rows.count) * rowH + CGFloat(rows.count - 1) + (more > 0 ? 1 + moreH : 0)
    let y0 = top + (bottom - top - panelH) / 2

    return ZStack(alignment: .topLeading) {
      header
      VStack(alignment: .leading, spacing: 0) {
        ForEach(Array(rows.enumerated()), id: \.offset) { i, show in
          if i > 0 { ink.separator.frame(height: 1).padding(.leading, compact ? 14 : 70) }
          HStack(spacing: 14) {
            if !compact { thumb(show) }
            VStack(alignment: .leading, spacing: 2) {
              Text(show.title)
                .font(.system(size: 16, weight: .semibold))
                .tracking(-0.32)
                .foregroundStyle(ink.label)
                .lineLimit(1)
              Text([show.venue, show.day].compactMap { $0 }.joined(separator: " · "))
                .font(.system(size: 13))
                .tracking(-0.08)
                .foregroundStyle(ink.secondary)
                .lineLimit(1)
            }
            Spacer(minLength: 12)
            if let rating = show.rating {
              CardStars(value: rating, size: 13, gap: 2, outline: ink.outline)
            }
          }
          .padding(.horizontal, 14)
          .frame(height: rowH)
        }
        if more > 0 {
          ink.separator.frame(height: 1)
          Text("+ \(plural(more, "more show"))")
            .font(.system(size: 14))
            .foregroundStyle(ink.secondary)
            .padding(.horizontal, 14)
            .frame(height: moreH)
        }
      }
      .frame(width: Self.inner, height: panelH, alignment: .topLeading)
      .background(ink.surface)
      .clipShape(.rect(cornerRadius: 12))
      .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(ink.separator, lineWidth: 1))
      .offset(x: Self.pad, y: y0)
    }
  }

  private func thumb(_ show: TripCardShow) -> some View {
    Group {
      if let photo = show.photo {
        Image(uiImage: photo).resizable().scaledToFill()
      } else {
        Text(Poster.initials(show.title))
          .font(.system(size: 20, weight: .bold))
          .foregroundStyle(ink.outline)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(ink.fill)
      }
    }
    .frame(width: 42, height: 56)
    .clipShape(.rect(cornerRadius: 8))
  }

  // MARK: - Photo grid

  /// A big coral count with the trip's stats beside it, then the photos.
  private var grid: some View {
    var stats: [(value: String?, rating: Double?, label: String)] = []
    if let place = data.place { stats.append((place, nil, data.cities > 1 ? "visited" : "city")) }
    if data.venues > 0 { stats.append((plural(data.venues, "theatre"), nil, "visited")) }
    if let average = data.average { stats.append((nil, average, "average rating")) }
    let statsBottom = Self.pad + CGFloat(stats.count) * 38 - 4
    let top = max(Self.pad + 18 + 72, statsBottom) + Self.gap

    return ZStack(alignment: .topLeading) {
      VStack(alignment: .trailing, spacing: 4) {
        ForEach(Array(stats.enumerated()), id: \.offset) { _, stat in
          VStack(alignment: .trailing, spacing: 0) {
            if let value = stat.value {
              Text(value)
                .font(.system(size: 15, weight: .semibold))
                .tracking(-0.24)
                .foregroundStyle(ink.label)
                .lineLimit(1)
                .frame(maxWidth: 160, alignment: .trailing)
                .frame(height: 20)
            } else if let rating = stat.rating {
              CardStars(value: rating, size: 13, gap: 2, outline: ink.outline).frame(height: 20)
            }
            Text(stat.label)
              .font(.system(size: 11))
              .tracking(0.06)
              .foregroundStyle(ink.secondary)
              .frame(height: 14)
          }
        }
      }
      .frame(width: Self.inner, alignment: .trailing)
      .offset(x: Self.pad, y: Self.pad)

      VStack(alignment: .leading, spacing: 0) {
        Text("\(data.name) · \(data.dates)")
          .font(.system(size: 13))
          .tracking(-0.08)
          .foregroundStyle(ink.secondary)
          .lineLimit(1)
          .frame(height: 18, alignment: .leading)
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text("\(shows.count)")
            .font(.system(size: 72, weight: .heavy))
            .tracking(-2.16)
            .foregroundStyle(CardInk.coral)
          Text(shows.count == 1 ? "show" : "shows")
            .font(.system(size: 16))
            .tracking(-0.32)
            .foregroundStyle(ink.secondary)
        }
        .frame(height: 72)
      }
      .frame(width: Self.inner - 176, alignment: .leading)
      .offset(x: Self.pad, y: Self.pad)

      photoGrid(top: top, shadow: false)
    }
  }

  private var squareGrid: some View {
    ZStack(alignment: .topLeading) {
      header
      photoGrid(top: Self.headerBottom + Self.gap, shadow: true)
    }
  }

  /// Rows of tiles: 1, 2, 1+2, 2+2, 2+3, 3+3; past 6 the last reads "+N".
  private func photoGrid(top: CGFloat, shadow: Bool) -> some View {
    let gap: CGFloat = 8
    let tiles = Array(shows.prefix(6))
    let more = shows.count - tiles.count
    let rows: [Int] = [1: [1], 2: [2], 3: [1, 2], 4: [2, 2], 5: [2, 3], 6: [3, 3]][tiles.count] ?? []
    let height = Self.footerTop - Self.gap - top
    let rowH = (height - gap * CGFloat(max(rows.count - 1, 0))) / CGFloat(max(rows.count, 1))
    var starts: [Int] = []
    var n = 0
    for count in rows {
      starts.append(n)
      n += count
    }
    return VStack(spacing: gap) {
      ForEach(Array(rows.enumerated()), id: \.offset) { r, count in
        HStack(spacing: gap) {
          ForEach(0..<count, id: \.self) { c in
            let i = starts[r] + c
            tile(tiles[i], radius: 8, more: i == tiles.count - 1 ? more : 0)
              .frame(height: rowH)
              .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(ink.separator, lineWidth: 1))
              .background {
                if shadow {
                  RoundedRectangle(cornerRadius: 8).fill(ink.surface)
                    .shadow(color: Palette.shadow.opacity(0.28), radius: 11, y: 10)
                }
              }
          }
        }
      }
    }
    .frame(width: Self.inner, height: height)
    .offset(x: Self.pad, y: top)
  }

  // MARK: - Collage

  private struct Polaroid {
    let left: CGFloat
    let top: CGFloat
    let rotate: Double
  }

  private struct Frame {
    let w: CGFloat
    let h: CGFloat
    let pad: CGFloat
  }

  private static let large = Frame(w: 200, h: 267, pad: 4)
  private static let medium = Frame(w: 168, h: 224, pad: 4)
  private static let small4 = Frame(w: 152, h: 202, pad: 4)
  private static let small = Frame(w: 110, h: 146, pad: 3)

  /// The canvas's "Trip collage" layouts, one per number of shows (1–8).
  private static let collages: [Int: (Frame, [Polaroid])] = [
    1: (Frame(w: 240, h: 320, pad: 5), [Polaroid(left: 122, top: 25, rotate: -3)]),
    2: (large, [.init(left: 30, top: 0, rotate: -4), .init(left: 254, top: 100, rotate: 3)]),
    3: (medium, [.init(left: 8, top: 10, rotate: -4), .init(left: 304, top: 0, rotate: 3), .init(left: 150, top: 140, rotate: -2)]),
    4: (
      small4,
      [
        .init(left: 60, top: 0, rotate: -4), .init(left: 272, top: 8, rotate: 3), .init(left: 60, top: 170, rotate: -2),
        .init(left: 272, top: 168, rotate: 4),
      ]
    ),
    5: (
      small4,
      [
        .init(left: 48, top: 0, rotate: -4), .init(left: 260, top: 8, rotate: 3), .init(left: 7, top: 170, rotate: -2),
        .init(left: 166, top: 168, rotate: 4), .init(left: 325, top: 170, rotate: -3),
      ]
    ),
    6: (
      small4,
      [
        .init(left: 7, top: 0, rotate: -4), .init(left: 166, top: 8, rotate: 3), .init(left: 325, top: 0, rotate: -2),
        .init(left: 7, top: 170, rotate: 4), .init(left: 166, top: 168, rotate: -3), .init(left: 325, top: 170, rotate: 2),
      ]
    ),
    7: (
      small,
      [
        .init(left: 76, top: 0, rotate: -4), .init(left: 274, top: 8, rotate: 3), .init(left: 38, top: 121, rotate: -2),
        .init(left: 187, top: 111, rotate: 4), .init(left: 336, top: 121, rotate: -3), .init(left: 76, top: 224, rotate: 2),
        .init(left: 274, top: 226, rotate: -5),
      ]
    ),
    8: (
      small,
      [
        .init(left: 38, top: 0, rotate: -4), .init(left: 187, top: 8, rotate: 3), .init(left: 336, top: 0, rotate: -2),
        .init(left: 100, top: 121, rotate: 4), .init(left: 298, top: 111, rotate: -3), .init(left: 38, top: 224, rotate: 2),
        .init(left: 187, top: 226, rotate: -5), .init(left: 336, top: 224, rotate: 3),
      ]
    ),
  ]

  /// A layout per number of shows, in date order. Past 8, the 8-show layout
  /// prefers shows with photos and the last polaroid reads "+N".
  private var collage: some View {
    let top = Self.headerBottom + Self.gap
    let bottom = Self.footerTop - 12
    var picks = shows
    if shows.count > 8 {
      let keep = Set(shows.indices.sorted { (shows[$0].photo != nil ? 0 : 1) < (shows[$1].photo != nil ? 0 : 1) }.prefix(8))
      picks = shows.indices.filter(keep.contains).map { shows[$0] }
    }
    let more = shows.count - picks.count
    let (frame, at) = Self.collages[max(1, picks.count)] ?? Self.collages[1]!
    let layoutH = at.map { $0.top + frame.h }.max() ?? 0
    let y0 = top + max(0, (bottom - top - layoutH) / 2)

    return ZStack(alignment: .topLeading) {
      header
      ForEach(Array(picks.enumerated()), id: \.offset) { i, show in
        let spot = at[i]
        tile(show, radius: 2, more: i == picks.count - 1 ? more : 0, titleTop: true)
          .padding(frame.pad)
          .frame(width: frame.w, height: frame.h)
          // The shadow goes on the frame only, so titles stay crisp.
          .background {
            RoundedRectangle(cornerRadius: 4).fill(ink.surface)
              .shadow(color: Palette.shadow.opacity(0.28), radius: 11, y: 10)
          }
          .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(ink.separator, lineWidth: 1))
          .rotationEffect(.degrees(spot.rotate))
          .offset(x: Self.pad + spot.left, y: y0 + spot.top)
      }
    }
  }

  // MARK: - Tiles

  /// A show's photo, or its title set large on `fill` when it has none: at
  /// the bottom left, or the top (`titleTop`) where the next polaroid in a
  /// collage overlaps the bottom.
  private func tile(_ show: TripCardShow, radius: CGFloat, more: Int, titleTop: Bool = false) -> some View {
    GeometryReader { geo in
      let small = geo.size.width < 140
      let inset: CGFloat = small ? 8 : 16
      let size = max(small ? 13 : 17, min(28, geo.size.width / 8))
      ZStack(alignment: titleTop ? .topLeading : .bottomLeading) {
        if let photo = show.photo {
          Image(uiImage: photo)
            .resizable()
            .scaledToFill()
            .frame(width: geo.size.width, height: geo.size.height)
            .clipped()
        } else {
          ink.fill
          Text(show.title)
            .font(.system(size: size, weight: .bold))
            .tracking(size * -0.01)
            .foregroundStyle(ink.label)
            .lineLimit(3)
            .lineSpacing(size * 0.1 - size * 0.2)
            .padding(inset)
        }
        if more > 0 {
          Color.black.opacity(0.55)
          Text("+\(more)")
            .font(.system(size: 34, weight: .heavy))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
    }
    .clipShape(.rect(cornerRadius: radius))
  }

  private func plural(_ n: Int, _ one: String) -> String { "\(n) \(n == 1 ? one : "\(one)s")" }
}

private func rgb(_ hex: UInt32) -> Color {
  Color(
    red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
}

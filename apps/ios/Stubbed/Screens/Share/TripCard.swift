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
  private static let footerTop: CGFloat = 472
  private static let gap: CGFloat = 24

  struct Ink {
    let ground, surface, fill, label, secondary, separator, outline, accent: Color
    static let dark = Ink(
      ground: CardInk.ground, surface: rgb(0x2C2C2E), fill: rgb(0x38383A), label: .white, secondary: rgb(0xAEAEB2),
      separator: rgb(0x38383A), outline: rgb(0x7C7C82), accent: CardInk.coral)
    static let light = Ink(
      ground: .white, surface: .white, fill: rgb(0xE9E9EE), label: rgb(0x1C1C1E), secondary: rgb(0x6C6C70),
      separator: rgb(0xE0E0E5), outline: rgb(0x8E8E93), accent: rgb(0xC4234A))
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
    .clipShape(.rect(cornerRadius: 32))
  }

  // MARK: - Shared header and footer

  private var subtitle: String {
    [data.place, data.dates, plural(shows.count, "show")].compactMap { $0 }.joined(separator: " · ")
  }
  private var titleHeight: CGFloat {
    let size = CardTitle.fit(data.name, size: 38, width: Self.inner)
    let lines = min(2, CardTitle.lines(data.name, font: .systemFont(ofSize: size, weight: .bold), width: Self.inner))
    return CGFloat(lines) * size * 42 / 38
  }
  private var subtitleHeight: CGFloat {
    CGFloat(min(2, CardTitle.lines(subtitle, font: .systemFont(ofSize: 18, weight: .medium), width: Self.inner))) * 22
  }
  private var headerBottom: CGFloat { Self.pad + titleHeight + 8 + subtitleHeight }

  private var header: some View {
    ZStack(alignment: .topLeading) {
      CardTitle(text: data.name, size: 38, lineHeight: 42, width: Self.inner, ink: ink.label)
      Text(subtitle).font(.system(size: 18, weight: .medium)).foregroundStyle(ink.secondary)
        .lineLimit(2).fixedSize(horizontal: false, vertical: true)
        .frame(width: Self.inner, alignment: .leading).offset(y: titleHeight + 8)
    }
    .frame(width: Self.inner, alignment: .topLeading)
    .offset(x: Self.pad, y: Self.pad)
  }

  private var footer: some View {
    CardFooter(handle: data.handle, ink: ink.label)
      .frame(width: Self.inner).offset(x: Self.pad, y: Self.footerTop)
  }

  // MARK: - List

  /// Up to 4 shows get photo rows; 5–6 compact rows; past 6, five rows and
  /// "+ N more shows" when larger rows would run into the footer.
  private var list: some View {
    let top = headerBottom + Self.gap
    let bottom = Self.footerTop - Self.gap
    let available = bottom - top
    let compact = shows.count > 4 || CGFloat(shows.count * 80 + max(0, shows.count - 1)) > available
    let rowH: CGFloat = compact ? 60 : 80
    var visible = min(shows.count, shows.count > 6 ? 5 : 6, Int((available + 1) / (rowH + 1)))
    if visible < shows.count { visible = min(visible, Int((available - 40) / (rowH + 1))) }
    let rows = Array(shows.prefix(max(1, visible)))
    let more = shows.count - rows.count
    let moreH: CGFloat = more > 0 ? 40 : 0
    let panelH = CGFloat(rows.count) * rowH + CGFloat(max(0, rows.count - 1)) + (more > 0 ? 1 + moreH : 0)
    let y0 = top + (available - panelH) / 2

    return ZStack(alignment: .topLeading) {
      header
      if shows.isEmpty {
        Text("No shows logged yet").font(.system(size: 22, weight: .medium)).foregroundStyle(ink.label)
          .offset(x: Self.pad, y: top + 60)
      }
      VStack(alignment: .leading, spacing: 0) {
        ForEach(Array(rows.enumerated()), id: \.offset) { i, show in
          if i > 0 { ink.separator.frame(height: 1).padding(.leading, compact ? 16 : 80) }
          HStack(spacing: 16) {
            if !compact { thumb(show) }
            VStack(alignment: .leading, spacing: 3) {
              Text(show.title)
                .font(.system(size: 22, weight: .semibold))
                .tracking(-0.3)
                .foregroundStyle(ink.label)
                .lineLimit(1)
              Text([show.venue, show.day].compactMap { $0 }.joined(separator: " · "))
                .font(.system(size: 16, weight: .medium))
                .tracking(-0.08)
                .foregroundStyle(ink.secondary)
                .lineLimit(1)
            }
            Spacer(minLength: 12)
            if let rating = show.rating {
              CardStars(value: rating, size: 16, gap: 2, outline: ink.outline)
            }
          }
          .padding(.horizontal, 16)
          .frame(height: rowH)
        }
        if more > 0 {
          ink.separator.frame(height: 1)
          Text("+ \(plural(more, "more show"))")
            .font(.system(size: 18, weight: .medium))
            .foregroundStyle(ink.secondary)
            .padding(.horizontal, 16)
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
    .frame(width: 48, height: 64)
    .clipShape(.rect(cornerRadius: 8))
  }

  // MARK: - Photo grid

  /// A big coral count with the trip's stats beside it, then the photos.
  private var grid: some View {
    let top = headerBottom + Self.gap
    return ZStack(alignment: .topLeading) {
      header
      HStack(alignment: .top, spacing: 16) {
        VStack(alignment: .leading, spacing: 6) {
          Text("Shows").font(.system(size: 18, weight: .medium))
          Text(String(shows.count)).font(.system(size: 64, weight: .heavy)).tracking(-1)
            .foregroundStyle(ink.accent).lineLimit(1).minimumScaleFactor(0.6)
        }.frame(maxWidth: .infinity, alignment: .leading)
        if data.venues > 0 {
          VStack(alignment: .leading, spacing: 6) {
            Text("Theatres").font(.system(size: 18, weight: .medium))
            Text(String(data.venues)).font(.system(size: 42, weight: .bold))
          }.frame(maxWidth: .infinity, alignment: .leading)
        }
        if let average = data.average {
          VStack(alignment: .leading, spacing: 20) {
            Text("Average").font(.system(size: 18, weight: .medium))
            CardStars(value: average, size: 18, gap: 2, outline: ink.outline)
          }.frame(maxWidth: .infinity, alignment: .leading)
        }
      }.foregroundStyle(ink.label).frame(width: Self.inner).offset(x: Self.pad, y: top)
      photoGrid(top: top + 100 + Self.gap, shadow: false)
    }
  }

  private var squareGrid: some View {
    ZStack(alignment: .topLeading) {
      header
      photoGrid(top: headerBottom + Self.gap, shadow: true)
    }
  }

  /// Rows of tiles: 1, 2, 1+2, 2+2, 2+3, 3+3; past 6 the last reads "+N".
  private func photoGrid(top: CGFloat, shadow: Bool) -> some View {
    let gap: CGFloat = 12
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
  private static let small = Frame(w: 144, h: 192, pad: 4)

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
        .init(left: 0, top: 0, rotate: -4), .init(left: 113, top: 8, rotate: 3),
        .init(left: 227, top: 0, rotate: -2), .init(left: 340, top: 6, rotate: 4),
        .init(left: 57, top: 178, rotate: -3), .init(left: 170, top: 184, rotate: 2),
        .init(left: 283, top: 178, rotate: -5),
      ]
    ),
    8: (
      small,
      [
        .init(left: 0, top: 0, rotate: -4), .init(left: 113, top: 8, rotate: 3),
        .init(left: 227, top: 0, rotate: -2), .init(left: 340, top: 6, rotate: 4),
        .init(left: 0, top: 180, rotate: 2), .init(left: 113, top: 176, rotate: -5),
        .init(left: 227, top: 184, rotate: 3), .init(left: 340, top: 178, rotate: -3),
      ]
    ),
  ]

  /// A layout per number of shows, in date order. Past 8, the 8-show layout
  /// prefers shows with photos and the last polaroid reads "+N".
  private var collage: some View {
    let top = headerBottom + Self.gap
    let bottom = Self.footerTop - Self.gap
    var picks = shows
    if shows.count > 8 {
      let keep = Set(shows.indices.sorted { (shows[$0].photo != nil ? 0 : 1) < (shows[$1].photo != nil ? 0 : 1) }.prefix(8))
      picks = shows.indices.filter(keep.contains).map { shows[$0] }
    }
    let more = shows.count - picks.count
    let (frame, at) = Self.collages[max(1, picks.count)] ?? Self.collages[1]!
    let bounds = Self.collageBounds(frame, at)
    let scale = min(1, Self.inner / bounds.width, (bottom - top) / bounds.height)
    let x0 = Self.pad + (Self.inner - bounds.width * scale) / 2
    let y0 = top + (bottom - top - bounds.height * scale) / 2

    return ZStack(alignment: .topLeading) {
      header
      ZStack(alignment: .topLeading) {
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
            .offset(x: spot.left - bounds.minX, y: spot.top - bounds.minY)
        }
      }.frame(width: bounds.width, height: bounds.height, alignment: .topLeading)
        .scaleEffect(scale, anchor: .topLeading).offset(x: x0, y: y0)
    }
  }

  private static func collageBounds(_ frame: Frame, _ spots: [Polaroid]) -> CGRect {
    var bounds = CGRect.null
    for spot in spots {
      let angle = spot.rotate * .pi / 180
      for (sx, sy) in [(-1.0, -1.0), (1, -1), (1, 1), (-1, 1)] {
        let dx = sx * frame.w / 2, dy = sy * frame.h / 2
        let point = CGPoint(x: spot.left + frame.w / 2 + cos(angle) * dx - sin(angle) * dy,
          y: spot.top + frame.h / 2 + sin(angle) * dx + cos(angle) * dy)
        bounds = bounds.union(CGRect(origin: point, size: CGSize(width: 0.001, height: 0.001)))
      }
    }
    return bounds
  }

  // MARK: - Tiles

  /// A show's photo, or its title set large on `fill` when it has none: at
  /// the bottom left, or the top (`titleTop`) where the next polaroid in a
  /// collage overlaps the bottom.
  private func tile(_ show: TripCardShow, radius: CGFloat, more: Int, titleTop: Bool = false) -> some View {
    GeometryReader { geo in
      let small = geo.size.width < 140
      let inset: CGFloat = small ? 8 : 16
      let size = max(small ? 16 : 20, min(30, geo.size.width / 7))
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
            .lineLimit(3).minimumScaleFactor(0.65)
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

import MapKit
import SwiftUI

struct CountryHeatmap: View {
  let countries: [InsightStats.Country]
  var ink: Color? = nil
  var accent: Color? = nil
  private static let shapes = CountryBoundary.load()

  var body: some View {
    // A fixed projection shows the whole world without stealing List gestures
    // or letting MapKit's camera crop countries on a compact screen.
    Canvas { context, size in
      let maximum = max(1, countries.map(\.count).max() ?? 1)
      let counts = Dictionary(countries.map { ($0.country, $0.count) }, uniquingKeysWith: +)
      context.fill(Path(CGRect(origin: .zero, size: size)),
        with: .color(ink?.opacity(0.04) ?? Color(.tertiarySystemFill).opacity(0.3)))
      // One drawing pass avoids hundreds of separate SwiftUI polygon views.
      for shape in Self.shapes where shape.code != "AQ" {
        let count = counts[shape.code] ?? 0
        let path = Path { path in
          for (index, coordinate) in shape.points.enumerated() {
            let point = CGPoint(
              x: (coordinate.longitude + 180) / 360 * size.width,
              y: (85 - coordinate.latitude) / 145 * size.height)
            if index == 0 { path.move(to: point) } else { path.addLine(to: point) }
          }
          path.closeSubpath()
        }
        let fill = count == 0
          ? (ink?.opacity(0.12) ?? Color(.systemGray4))
          : (accent ?? ink ?? Palette.tint).opacity(0.3 + 0.6 * Double(count) / Double(maximum))
        context.fill(path, with: .color(fill))
        context.stroke(path,
          with: .color(ink?.opacity(0.2) ?? Color(.secondarySystemGroupedBackground)), lineWidth: 0.5)
      }
    }
    .aspectRatio(2, contentMode: .fit)
    .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
    .accessibilityLabel(
      "World map of your theatre visits. Country counts and show links follow below.")
  }
}

private struct CountryBoundary: Identifiable {
  let id: Int
  let code: String
  let points: [CLLocationCoordinate2D]

  static func load() -> [CountryBoundary] {
    guard let url = Bundle.main.url(forResource: "Countries", withExtension: "geojson"),
      let data = try? Data(contentsOf: url),
      let objects = try? MKGeoJSONDecoder().decode(data)
    else { return [] }
    var shapes: [CountryBoundary] = []
    for case let feature as MKGeoJSONFeature in objects {
      guard let properties = feature.properties,
        let value = try? JSONSerialization.jsonObject(with: properties) as? [String: String],
        let code = value["code"]
      else { continue }
      for geometry in feature.geometry {
        let polygons: [MKPolygon]
        if let multi = geometry as? MKMultiPolygon {
          polygons = multi.polygons
        } else if let polygon = geometry as? MKPolygon {
          polygons = [polygon]
        } else {
          continue
        }
        for polygon in polygons {
          var coordinates = Array(repeating: CLLocationCoordinate2D(), count: polygon.pointCount)
          polygon.getCoordinates(
            &coordinates, range: NSRange(location: 0, length: polygon.pointCount))
          shapes.append(CountryBoundary(id: shapes.count, code: code, points: coordinates))
        }
      }
    }
    return shapes
  }
}

struct CategoryRadar: View {
  let categories: [InsightStats.Category]
  private var values: [Double] {
    ShowType.ordered.map { type in Double(categories.first { $0.type == type.rawValue }?.count ?? 0)
    }
  }

  var body: some View {
    GeometryReader { geometry in
      let center = CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
      let radius = max(24, min(geometry.size.width - 140, geometry.size.height - 80) / 2)
      let maximum = max(1, values.max() ?? 1)
      ZStack {
        ForEach(1..<5) { level in
          polygon(
            values: Array(repeating: Double(level) / 4, count: values.count), center: center,
            radius: radius
          )
          .stroke(Color.primary.opacity(0.1), lineWidth: 1)
        }
        ForEach(Array(ShowType.ordered.enumerated()), id: \.offset) { index, type in
          let edge = point(index, count: values.count, fraction: 1, center: center, radius: radius)
          Path { path in
            path.move(to: center)
            path.addLine(to: edge)
          }
          .stroke(Color.primary.opacity(0.1), lineWidth: 1)
          Text(type.label).font(.footnote).foregroundStyle(.secondary)
            .position(
              point(index, count: values.count, fraction: 1, center: center, radius: radius + 27))
        }
        polygon(values: values.map { $0 / maximum }, center: center, radius: radius)
          .fill(Palette.tint.opacity(0.18))
        polygon(values: values.map { $0 / maximum }, center: center, radius: radius)
          .stroke(Palette.tintText, lineWidth: 2)
      }
    }
    .frame(height: 280)
    .accessibilityHidden(true)
    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
  }

  private func point(_ index: Int, count: Int, fraction: Double, center: CGPoint, radius: Double)
    -> CGPoint
  {
    let angle = Double(index) / Double(count) * 2 * .pi - .pi / 2
    return CGPoint(
      x: center.x + cos(angle) * radius * fraction, y: center.y + sin(angle) * radius * fraction)
  }

  private func polygon(values: [Double], center: CGPoint, radius: Double) -> Path {
    Path { path in
      for (index, value) in values.enumerated() {
        let p = point(index, count: values.count, fraction: value, center: center, radius: radius)
        if index == 0 { path.move(to: p) } else { path.addLine(to: p) }
      }
      path.closeSubpath()
    }
  }
}

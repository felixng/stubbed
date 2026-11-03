import Foundation
import ImageIO
import Supabase

/// What a photo's EXIF says: when (the camera's own wall-clock date and
/// time) and where it was taken. Read on the device; the location is used
/// for the nearby lookup only and never stored.
struct PhotoMeta: Equatable, Sendable {
  var date: String?
  var time: String?
  var lat: Double?
  var lng: Double?
  var accuracy: Double?

  static func read(_ data: Data) -> PhotoMeta {
    var meta = PhotoMeta()
    guard
      let source = CGImageSourceCreateWithData(data as CFData, nil),
      let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    else { return meta }
    let exif = props[kCGImagePropertyExifDictionary] as? [CFString: Any]
    let tiff = props[kCGImagePropertyTIFFDictionary] as? [CFString: Any]
    // "2026:10:05 19:42:10"
    if let taken = (exif?[kCGImagePropertyExifDateTimeOriginal] ?? tiff?[kCGImagePropertyTIFFDateTime]) as? String {
      let parts = taken.split(separator: " ")
      if parts.count >= 2 {
        meta.date = parts[0].replacingOccurrences(of: ":", with: "-")
        meta.time = String(parts[1].prefix(5))
      }
      if meta.date?.count != 10 { meta.date = nil }
    }
    if let gps = props[kCGImagePropertyGPSDictionary] as? [CFString: Any],
      let lat = gps[kCGImagePropertyGPSLatitude] as? Double,
      let lng = gps[kCGImagePropertyGPSLongitude] as? Double
    {
      meta.lat = (gps[kCGImagePropertyGPSLatitudeRef] as? String) == "S" ? -lat : lat
      meta.lng = (gps[kCGImagePropertyGPSLongitudeRef] as? String) == "W" ? -lng : lng
      if let error = gps[kCGImagePropertyGPSHPositioningError] as? Double, error > 0 { meta.accuracy = error }
    }
    return meta
  }
}

/// The photo step from apps/web/src/lib/import/photo-pipeline.ts: theatres
/// near where the photo was taken. Best effort; a failure leaves the venue
/// for the user to fill in.
enum PhotoDetect {
  static let nearbyRadius: Double = 150
  static let minNearbyRadius: Double = 60

  /// The search radius for a photo's stated GPS accuracy.
  static func radius(accuracy: Double?) -> Double {
    guard let accuracy, accuracy.isFinite, accuracy > 0 else { return nearbyRadius }
    return (min(nearbyRadius, max(minNearbyRadius, accuracy * 2.5))).rounded()
  }

  static func distance(_ lat1: Double, _ lng1: Double, _ lat2: Double, _ lng2: Double) -> Double {
    let r = { (d: Double) in d * .pi / 180 }
    let a = pow(sin(r(lat2 - lat1) / 2), 2) + cos(r(lat1)) * cos(r(lat2)) * pow(sin(r(lng2 - lng1) / 2), 2)
    return 2 * 6_371_000 * asin(sqrt(a))
  }

  struct Nearby: Sendable {
    var candidates: [VenueChoice] = []
    var city: String?
    var country: String?
  }

  /// Theatres near a point: the web's OpenStreetMap lookup and the saved
  /// venues nearby, merged (a saved venue replaces its OSM twin), nearest
  /// first.
  static func nearby(lat: Double, lng: Double, accuracy: Double?) async -> Nearby {
    let radius = radius(accuracy: accuracy)
    async let found = osm(lat: lat, lng: lng, accuracy: accuracy)
    async let saved = savedVenues(lat: lat, lng: lng, radius: radius)
    let (places, rows) = await (found, saved)
    var candidates: [VenueChoice] = (places?.candidates ?? []).map { c in
      if let row = rows.first(where: { $0.osmId == c.osm_id }) {
        var v = row
        v.distance = c.distance_m
        return v
      }
      return VenueChoice(
        name: c.name, city: c.city, country: c.country, lat: c.lat, lng: c.lng, osmId: c.osm_id, distance: c.distance_m)
    }
    for v in rows where !candidates.contains(where: { $0.id != nil && $0.id == v.id }) { candidates.append(v) }
    candidates.sort { ($0.distance ?? 0) < ($1.distance ?? 0) }
    return Nearby(
      candidates: Array(candidates.prefix(8)), city: places?.city ?? rows.first?.city,
      country: places?.country ?? rows.first?.country)
  }

  private struct Places: Decodable {
    struct Candidate: Decodable {
      let osm_id: String
      let name: String
      let city: String?
      let country: String?
      let lat: Double
      let lng: Double
      let distance_m: Int
    }
    let candidates: [Candidate]
    let city: String?
    let country: String?
  }

  /// POST /api/photo/nearby on the web app, with the session as a Bearer
  /// token. Offline or failed: nil, and saved venues carry on alone.
  private static func osm(lat: Double, lng: Double, accuracy: Double?) async -> Places? {
    struct Body: Encodable {
      let lat: Double
      let lng: Double
      let accuracy_m: Double?
    }
    guard var request = await authorized("api/photo/nearby") else { return nil }
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    // Give up after a few seconds; saved venues carry on alone.
    request.timeoutInterval = 6
    request.httpBody = try? JSONEncoder().encode(Body(lat: lat, lng: lng, accuracy_m: accuracy))
    guard let (data, response) = try? await URLSession.shared.data(for: request),
      (response as? HTTPURLResponse)?.statusCode == 200
    else { return nil }
    return try? JSONDecoder().decode(Places.self, from: data)
  }

  /// Saved venues within the radius: instant, and found even when the
  /// OpenStreetMap lookups are down.
  private static func savedVenues(lat: Double, lng: Double, radius: Double) async -> [VenueChoice] {
    let dLat = radius / 111_320
    let dLng = dLat / max(0.2, cos(lat * .pi / 180))
    let rows: [Venue] =
      (try? await supabase.from("venues").select("id, name, city, country, lat, lng, osm_id")
        .gte("lat", value: lat - dLat).lte("lat", value: lat + dLat)
        .gte("lng", value: lng - dLng).lte("lng", value: lng + dLng)
        .limit(20).execute().value) ?? []
    return rows.compactMap { row in
      guard let vLat = row.lat, let vLng = row.lng else { return nil }
      let d = distance(lat, lng, vLat, vLng)
      guard d <= radius else { return nil }
      var v = VenueChoice(row)
      v.distance = Int(d.rounded())
      return v
    }
  }

  /// A POST to the web app with the session's access token.
  private static func authorized(_ path: String) async -> URLRequest? {
    guard let token = try? await supabase.auth.session.accessToken else { return nil }
    var request = URLRequest(url: AppConfig.current.webURL.appendingPathComponent(path))
    request.httpMethod = "POST"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    return request
  }
}

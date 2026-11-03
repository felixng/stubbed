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
    /// The answer came from our own venues table, not OpenStreetMap.
    var fromSaved = false

    /// The one theatre to fill in at once: only when our own table has exactly one in range.
    var singleSaved: VenueChoice? { fromSaved && candidates.count == 1 ? candidates[0] : nil }
  }

  /// Theatres near a point, nearest first. Saved venues first: if any is in
  /// range, that's the answer (city and country from the nearest) and
  /// OpenStreetMap isn't asked. Only when none is saved nearby does the web's
  /// OpenStreetMap lookup run. Both sources can be swapped for tests.
  static func nearby(
    lat: Double, lng: Double, accuracy: Double?,
    saved: (Double, Double, Double) async -> [VenueChoice] = savedVenues,
    osm: (Double, Double, Double?) async -> Places? = osm
  ) async -> Nearby {
    let rows = await saved(lat, lng, radius(accuracy: accuracy))
    if !rows.isEmpty {
      return Nearby(
        candidates: Array(rows.prefix(8)), city: rows[0].city, country: rows[0].country, fromSaved: true)
    }
    let places = await osm(lat, lng, accuracy)
    let candidates = (places?.candidates ?? []).map { c in
      VenueChoice(
        name: c.name, city: c.city, country: c.country, lat: c.lat, lng: c.lng, osmId: c.osm_id, distance: c.distance_m)
    }
    return Nearby(candidates: Array(candidates.prefix(8)), city: places?.city, country: places?.country)
  }

  struct Places: Decodable {
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
  static func osm(lat: Double, lng: Double, accuracy: Double?) async -> Places? {
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

  /// Saved venues within the radius, nearest first: one database call (the
  /// rule lives in Postgres), found even when OpenStreetMap is down.
  static func savedVenues(lat: Double, lng: Double, radius: Double) async -> [VenueChoice] {
    struct Params: Encodable {
      let lat: Double
      let lng: Double
      let radius_m: Double
    }
    struct Row: Decodable {
      let id: UUID
      let name: String
      let city: String?
      let country: String?
      let lat: Double?
      let lng: Double?
      let osm_id: String?
      let distance_m: Int
    }
    let rows: [Row] =
      (try? await supabase.rpc("nearby_venues", params: Params(lat: lat, lng: lng, radius_m: radius)).execute().value)
      ?? []
    return rows.map {
      VenueChoice(
        id: $0.id, name: $0.name, city: $0.city, country: $0.country, lat: $0.lat, lng: $0.lng, osmId: $0.osm_id,
        distance: $0.distance_m)
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

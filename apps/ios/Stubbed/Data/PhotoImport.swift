import Foundation

/// Importing several photos at once (#155): group them into theatre visits,
/// then log each visit from its photo. Nothing here is stored; leaving the
/// import part-way just stops it.
enum PhotoImport {
  /// The most photos one import reads. Each is read once for its date and
  /// place, then let go; only the visit's own photo is read again.
  static let maxPhotos = 100

  /// Photos within this distance and time of each other count as one visit
  /// (`SAME_VISIT_M` and `SAME_VISIT_MINUTES` in apps/web/src/lib/import/drafts.ts).
  static let sameVisitMeters: Double = 250
  static let sameVisitMinutes = 5 * 60

  private static func minutes(_ time: String?) -> Int? {
    guard let time, time.count >= 5, let h = Int(time.prefix(2)), let m = Int(time.dropFirst(3).prefix(2)) else { return nil }
    return h * 60 + m
  }

  /// The web's `groupPhotos`: photos from the same visit (same date, within
  /// a few hours, and close together when both have a location) form one
  /// visit. Photos with no date stay on their own. Visits come back in time
  /// order, each with its photos in time order.
  static func group<T>(_ photos: [T], meta: (T) -> PhotoMeta) -> [[T]] {
    func key(_ p: T) -> String {
      let m = meta(p)
      return (m.date ?? "9999") + " " + (m.time ?? "99:99")
    }
    let keys = photos.map(key)
    let order = photos.indices.sorted { a, b in keys[a] == keys[b] ? a < b : keys[a] < keys[b] }
    let sorted = order.map { photos[$0] }
    var groups: [[T]] = []
    for p in sorted {
      let m = meta(p)
      let index: Int? =
        m.date == nil
        ? nil
        : groups.firstIndex { g in
          guard meta(g[0]).date == m.date else { return false }
          if let a = minutes(meta(g[g.count - 1]).time), let b = minutes(m.time), abs(b - a) > sameVisitMinutes {
            return false
          }
          // Compare against every located photo in the group, so a chain of
          // nearby shots can't drift down the street.
          return g.allSatisfy { q in
            let qm = meta(q)
            guard let qLat = qm.lat, let qLng = qm.lng, let lat = m.lat, let lng = m.lng else { return true }
            return PhotoDetect.distance(qLat, qLng, lat, lng) <= sameVisitMeters
          }
        }
      if let index { groups[index].append(p) } else { groups.append([p]) }
    }
    return groups
  }
}

/// A photo's lookup, started as soon as it's made: theatres near where it
/// was taken, and any text printed in it (a programme, ticket or poster). The
/// import starts the next visit's lookup while you're on the current one, so
/// its form opens already filled.
final class PhotoLookup: Sendable {
  let meta: PhotoMeta
  /// Nil when the photo has no location.
  let nearby: Task<PhotoDetect.Nearby?, Never>
  /// Read on the device; nil when the photo can't be decoded.
  let text: Task<PhotoText.Reading?, Never>

  /// `data` is the original photo: its EXIF is read here and never stored.
  init(data: Data) {
    let meta = PhotoMeta.read(data)
    self.meta = meta
    let nearby = Task<PhotoDetect.Nearby?, Never> {
      guard let lat = meta.lat, let lng = meta.lng else { return nil }
      return await PhotoDetect.nearby(lat: lat, lng: lng, accuracy: meta.accuracy)
    }
    self.nearby = nearby
    text = Task { await PhotoText.read(data) }
  }

  deinit {
    nearby.cancel()
    text.cancel()
  }
}

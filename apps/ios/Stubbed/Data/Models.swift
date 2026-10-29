import Foundation

// The app's view of the catalogue and entries, mirroring
// apps/web/src/lib/entries.ts. Rules (ownership, visibility, rating steps,
// trips holding only entries within their dates) live in Postgres.

typealias ShowType = PublicSchema.ShowType
typealias Visibility = PublicSchema.Visibility
typealias EntryStatus = PublicSchema.EntryStatus

extension ShowType {
  static let ordered: [ShowType] = [.musical, .play, .opera, .dance, .comedy, .standup, .other]

  var label: String {
    switch self {
    case .musical: "Musical"
    case .play: "Play"
    case .opera: "Opera"
    case .dance: "Dance"
    case .comedy: "Comedy"
    case .standup: "Stand-up"
    case .other: "Other"
    }
  }
}

struct Show: Codable, Hashable, Identifiable, Sendable {
  let id: UUID
  let title: String
  let type: ShowType

  init(id: UUID, title: String, type: ShowType) {
    self.id = id
    self.title = title
    self.type = type
  }

  /// A type added to Postgres after this build reads as Other, so older
  /// builds keep loading feeds and diaries that include it.
  init(from decoder: any Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(UUID.self, forKey: .id)
    title = try c.decode(String.self, forKey: .title)
    type = ShowType(rawValue: try c.decode(String.self, forKey: .type)) ?? .other
  }
}

/// A show picked on the form: one from the catalogue (`id` set) or a new
/// one, created on save so an abandoned form leaves no stray rows.
struct ShowChoice: Hashable, Sendable {
  var id: UUID?
  var title: String
  var type: ShowType

  init(_ show: Show) {
    id = show.id
    title = show.title
    type = show.type
  }

  init(newTitle: String, type: ShowType = .musical) {
    id = nil
    title = newTitle
    self.type = type
  }
}

struct Venue: Codable, Hashable, Identifiable, Sendable {
  let id: UUID
  let name: String
  let city: String?
  let country: String?
  var lat: Double?
  var lng: Double?
  var osmId: String?

  enum CodingKeys: String, CodingKey {
    case id, name, city, country, lat, lng
    case osmId = "osm_id"
  }

  /// "London, United Kingdom", or nil when neither is known.
  var place: String? {
    let parts = [city, country].compactMap { $0 }.filter { !$0.isEmpty }
    return parts.isEmpty ? nil : parts.joined(separator: ", ")
  }
}

/// A venue picked on the form: from the catalogue, from OpenStreetMap near
/// a photo (`osmId`), or typed in (needs a city and country).
struct VenueChoice: Hashable, Sendable {
  var id: UUID?
  var name: String
  var city: String?
  var country: String?
  var lat: Double?
  var lng: Double?
  var osmId: String?
  /// Metres from where the photo was taken, for nearby theatres.
  var distance: Int?

  init(_ venue: Venue) {
    id = venue.id
    name = venue.name
    city = venue.city
    country = venue.country
    lat = venue.lat
    lng = venue.lng
    osmId = venue.osmId
  }

  init(
    id: UUID? = nil, name: String, city: String?, country: String?, lat: Double? = nil, lng: Double? = nil,
    osmId: String? = nil, distance: Int? = nil
  ) {
    self.id = id
    self.name = name
    self.city = city
    self.country = country
    self.lat = lat
    self.lng = lng
    self.osmId = osmId
    self.distance = distance
  }

  /// Typed in by hand: not in the catalogue and not from OpenStreetMap.
  var isNew: Bool { id == nil && osmId == nil }

  var place: String? {
    let parts = [city, country].compactMap { $0 }.filter { !$0.isEmpty }
    return parts.isEmpty ? nil : parts.joined(separator: ", ")
  }
}

/// A trip: always dated, holding only entries within its dates.
struct Trip: Codable, Hashable, Identifiable, Sendable {
  let id: UUID
  let name: String
  let startDate: String
  let endDate: String

  enum CodingKeys: String, CodingKey {
    case id, name
    case startDate = "start_date"
    case endDate = "end_date"
  }

  static let select = "id, name, start_date, end_date"

  func covers(_ day: String) -> Bool { startDate <= day && day <= endDate }

  var dates: String { Day.formatRange(startDate, endDate) }

  /// How long the trip is in nights, end date minus start date (9–17 Oct is
  /// 8; a one-day trip is 0), as the web's `tripNights`. Never a count of
  /// show dates: a show can be in the afternoon.
  var nights: Int {
    max(0, Calendar.current.dateComponents([.day], from: Day.date(startDate), to: Day.date(endDate)).day ?? 0)
  }
}

/// An entry with its show, venue and trips, as the diary and entry screen
/// read it (the web's ENTRY_SELECT).
struct Entry: Decodable, Hashable, Identifiable, Sendable {
  struct TripRef: Decodable, Hashable, Sendable {
    let id: UUID
    let name: String
  }

  let id: UUID
  let userId: UUID
  let date: String
  let rating: Double?
  let note: String?
  let photoPath: String?
  let visibility: Visibility
  let status: EntryStatus
  let show: Show
  /// Nil for a planned show without a venue yet.
  let venue: Venue?
  let trips: [TripRef]

  static let select =
    "id, user_id, date, rating, note, photo_path, visibility, status, show:shows!inner(id, title, type), venue:venues(id, name, city, country, lat, lng, osm_id), collections:entry_collections(collection:collections(id, name))"

  var planned: Bool { status == .planned }

  enum CodingKeys: String, CodingKey {
    case id, date, rating, note, visibility, status, show, venue, collections
    case userId = "user_id"
    case photoPath = "photo_path"
  }

  private struct Link: Decodable { let collection: TripRef? }

  init(from decoder: any Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(UUID.self, forKey: .id)
    userId = try c.decode(UUID.self, forKey: .userId)
    date = try c.decode(String.self, forKey: .date)
    rating = try c.decodeIfPresent(Double.self, forKey: .rating)
    note = try c.decodeIfPresent(String.self, forKey: .note)
    photoPath = try c.decodeIfPresent(String.self, forKey: .photoPath)
    visibility = try c.decode(Visibility.self, forKey: .visibility)
    status = try c.decode(EntryStatus.self, forKey: .status)
    show = try c.decode(Show.self, forKey: .show)
    venue = try c.decodeIfPresent(Venue.self, forKey: .venue)
    trips = (try c.decodeIfPresent([Link].self, forKey: .collections) ?? []).compactMap(\.collection)
  }

  /// "Golden Theatre, New York", or nil.
  var whereText: String? {
    let parts = [venue?.name, venue?.city].compactMap { $0 }
    return parts.isEmpty ? nil : parts.joined(separator: ", ")
  }
}

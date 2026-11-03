import Foundation
import Supabase

/// Entry, show and venue reads and writes, like apps/web/src/lib/entries.ts.
/// Every rule is enforced by RLS and constraints in Postgres.
enum Entries {
  static let photoBucket = "entry-photos"

  static func photoPath(userId: UUID, entryId: UUID) -> String {
    "\(userId.uuidString.lowercased())/\(entryId.uuidString.lowercased()).jpg"
  }

  // MARK: - Reads

  static func entry(_ id: UUID) async throws -> Entry {
    try await supabase.from("entries").select(Entry.select).eq("id", value: id).single().execute().value
  }

  /// Signed URLs for photo paths (the bucket is private; RLS decides who may
  /// sign). Missing or failed paths are left out.
  static func signPhotos(_ paths: [String?], expiresIn: Int = 3600) async -> [String: URL] {
    let unique = Array(Set(paths.compactMap { $0 }))
    guard !unique.isEmpty else { return [:] }
    do {
      let signed = try await supabase.storage.from(photoBucket).createSignedURLs(paths: unique, expiresIn: expiresIn)
      var urls: [String: URL] = [:]
      for result in signed {
        if case .success(let path, let url) = result { urls[path] = url }
      }
      return urls
    } catch {
      Log.data.error("Signing photos failed: \(error.localizedDescription, privacy: .public)")
      return [:]
    }
  }

  static func searchShows(_ query: String) async throws -> [Show] {
    try await supabase.rpc("search_shows", params: ["q": query]).execute().value
  }

  /// Every name each show goes by: title, Wikidata aliases, taught nicknames.
  static func showMatchNames(_ ids: [UUID]) async throws -> [UUID: [String]] {
    struct Row: Decodable {
      let show_id: UUID
      let name: String
    }
    let rows: [Row] = try await supabase.rpc("show_match_names", params: ["show_ids": ids]).execute().value
    return Dictionary(grouping: rows, by: \.show_id).mapValues { $0.map(\.name) }
  }

  /// Saves a search as a nickname for the show picked after it (#35). The
  /// database skips searches that already find the show. Returns whether it saved.
  @discardableResult
  static func rememberShowAlias(_ alias: String, for showID: UUID) async throws -> Bool {
    struct Params: Encodable {
      let show_id: UUID
      let alias: String
    }
    return try await supabase.rpc("remember_show_alias", params: Params(show_id: showID, alias: alias))
      .execute().value
  }

  /// Close existing matches for a show or venue about to be added, best
  /// first (#146). `same` means it's the same one, so saving reuses it.
  struct Similar<Item: Decodable & Sendable>: Decodable, Sendable {
    let item: Item
    let same: Bool

    init(from decoder: any Decoder) throws {
      item = try Item(from: decoder)
      same = try decoder.container(keyedBy: Keys.self).decode(Bool.self, forKey: .same)
    }

    private enum Keys: String, CodingKey { case same }
  }

  static func similarShows(_ title: String) async throws -> [Similar<Show>] {
    try await supabase.rpc("similar_shows", params: ["q": title]).execute().value
  }

  static func similarVenues(_ name: String, near: (lat: Double, lng: Double)?, city: String?) async throws
    -> [Similar<Venue>]
  {
    struct Params: Encodable {
      let q: String
      let near_lat: Double?
      let near_lng: Double?
      let in_city: String?
    }
    let city = city?.trimmingCharacters(in: .whitespaces)
    return try await supabase.rpc(
      "similar_venues",
      params: Params(q: name, near_lat: near?.lat, near_lng: near?.lng, in_city: city?.isEmpty == false ? city : nil)
    ).execute().value
  }

  /// "HAMILTON - Premium Orchestra" → "Hamilton". New shows are also tidied
  /// on insert, so this is for showing the title before saving.
  static func tidyShowTitle(_ title: String) async throws -> String {
    let tidy: String? = try await supabase.rpc("tidy_show_title", params: ["title": title]).execute().value
    return tidy ?? title.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  static func searchVenues(_ query: String, near: (lat: Double, lng: Double)? = nil) async throws -> [Venue] {
    struct Params: Encodable {
      let q: String
      let near_lat: Double?
      let near_lng: Double?
    }
    return try await supabase.rpc("search_venues", params: Params(q: query, near_lat: near?.lat, near_lng: near?.lng))
      .execute().value
  }

  /// What the log form needs about its owner: default visibility, trips,
  /// and venues used recently (with the show each went with).
  struct FormContext: Sendable {
    var visibility: Visibility = .public
    var trips: [Trip] = []
    var recent: [(showId: UUID, venue: Venue)] = []
  }

  static func formContext(userId: UUID) async throws -> FormContext {
    struct Profile: Decodable { let default_visibility: Visibility }
    struct Recent: Decodable {
      let show_id: UUID
      let venue: Venue
    }
    async let profile: Profile = supabase.from("profiles").select("default_visibility").eq("id", value: userId)
      .single().execute().value
    async let trips: [Trip] = supabase.from("collections").select(Trip.select).eq("user_id", value: userId)
      .eq("kind", value: "trip").order("start_date", ascending: false).execute().value
    async let recent: [Recent] = supabase.from("entries")
      .select("show_id, venue:venues!inner(id, name, city, country, lat, lng, osm_id)")
      .eq("user_id", value: userId).order("date", ascending: false).limit(50).execute().value
    let (p, t, r) = try await (profile, trips, recent)
    return FormContext(visibility: p.default_visibility, trips: t, recent: r.map { ($0.show_id, $0.venue) })
  }

  // MARK: - Catalogue

  /// Reuses the same existing show ("Les Miserables (Broadway)" is Les
  /// Misérables), so a suggested or retyped title doesn't add a duplicate.
  static func ensureShow(_ show: ShowChoice) async throws -> UUID {
    if let id = show.id { return id }
    let title = show.title.trimmingCharacters(in: .whitespacesAndNewlines)
    if let same = try await similarShows(title).first(where: \.same) {
      return same.item.id
    }
    struct Insert: Encodable {
      let title: String
      let type: ShowType
    }
    struct Row: Decodable { let id: UUID }
    let row: Row = try await supabase.from("shows").insert(Insert(title: title, type: show.type)).select("id")
      .single().execute().value
    return row.id
  }

  /// OpenStreetMap venues match on osm_id, then on the same venue nearby or
  /// in the same city ("Wyndhams Theater" is Wyndham's Theatre); otherwise a
  /// new row is added.
  static func ensureVenue(_ venue: VenueChoice) async throws -> UUID {
    if let id = venue.id { return id }
    struct Row: Decodable { let id: UUID }
    let name = venue.name.trimmingCharacters(in: .whitespacesAndNewlines)
    if let osmId = venue.osmId {
      let rows: [Row] = try await supabase.from("venues").select("id").eq("osm_id", value: osmId).limit(1).execute()
        .value
      if let row = rows.first { return row.id }
    }
    let near = venue.lat.flatMap { lat in venue.lng.map { (lat, $0) } }
    let city = (venue.city ?? "").trimmingCharacters(in: .whitespaces)
    if let same = try await similarVenues(name, near: near, city: venue.city).first(where: \.same) {
      return same.item.id
    }
    struct Insert: Encodable {
      let name: String
      let city: String?
      let country: String?
      let lat: Double?
      let lng: Double?
      let osm_id: String?
    }
    let country = (venue.country ?? "").trimmingCharacters(in: .whitespaces)
    let row: Row = try await supabase.from("venues")
      .insert(
        Insert(
          name: name, city: city.isEmpty ? nil : city, country: country.isEmpty ? nil : country, lat: venue.lat,
          lng: venue.lng, osm_id: venue.osmId)
      )
      .select("id").single().execute().value
    return row.id
  }

  // MARK: - Writes

  /// Everything the form saves. `photo` is new JPEG data (already
  /// re-encoded); `keepPhoto` keeps the entry's existing one.
  struct Draft: Sendable {
    var id: UUID
    var show: ShowChoice
    var venue: VenueChoice?
    var date: String
    var rating: Double?
    var note: String
    var visibility: Visibility
    var tripIds: Set<UUID>
    var photo: Data?
    var keepPhoto: Bool
  }

  struct Saved: Sendable {
    let id: UUID
    let photoFailed: Bool
  }

  enum SaveError: LocalizedError {
    case step(String, any Error)
    var errorDescription: String? {
      if case .step(let step, let error) = self { return "Couldn’t save the \(step): \(error.localizedDescription)" }
      return nil
    }
  }

  /// Saves a new or edited entry in the web's order: catalogue rows, trip
  /// links removed, the entry, trip links added, then the photo last, so a
  /// failed upload never loses the entry.
  static func save(_ draft: Draft, userId: UUID, editing original: Entry?) async throws -> Saved {
    var step = "show"
    do {
      let showId = try await ensureShow(draft.show)
      step = "venue"
      let venueId = try await draft.venue.asyncMap(ensureVenue)

      // Links go before the entry is re-dated: the database keeps a trip's
      // shows within its dates.
      step = "trips"
      let before = Set(original?.trips.map(\.id) ?? [])
      let removed = before.subtracting(draft.tripIds)
      let added = draft.tripIds.subtracting(before)
      if !removed.isEmpty {
        try await supabase.from("entry_collections").delete().eq("entry_id", value: draft.id)
          .in("collection_id", values: removed.map(\.uuidString)).execute()
      }

      step = "entry"
      let planned = Day.status(draft.date) == .planned
      let keptPath = draft.keepPhoto ? original?.photoPath : nil
      struct Fields: Encodable {
        let id: UUID
        let show_id: UUID
        let venue_id: UUID?
        let date: String
        let status: EntryStatus
        let rating: Double?
        let note: String?
        let visibility: Visibility
        let photo_path: String?
      }
      let note = draft.note.trimmingCharacters(in: .whitespacesAndNewlines)
      let fields = Fields(
        id: draft.id, show_id: showId, venue_id: venueId, date: draft.date, status: planned ? .planned : .logged,
        rating: planned ? nil : draft.rating, note: note.isEmpty ? nil : note, visibility: draft.visibility,
        photo_path: keptPath)
      if original != nil {
        try await supabase.from("entries").update(fields).eq("id", value: draft.id).execute()
      } else {
        // Upsert, so retrying after a later step failed doesn't trip over the id.
        try await supabase.from("entries").upsert(fields).execute()
      }

      // A removed photo: the entry no longer points at it, so delete the file.
      if let old = original?.photoPath, keptPath == nil, draft.photo == nil {
        _ = try? await supabase.storage.from(photoBucket).remove(paths: [old])
      }

      step = "trips"
      if !added.isEmpty {
        struct Link: Encodable {
          let entry_id: UUID
          let collection_id: UUID
        }
        try await supabase.from("entry_collections")
          .upsert(added.map { Link(entry_id: draft.id, collection_id: $0) }, ignoreDuplicates: true).execute()
      }

      var photoFailed = false
      if let photo = draft.photo {
        let path = photoPath(userId: userId, entryId: draft.id)
        do {
          try await supabase.storage.from(photoBucket)
            .upload(path, data: photo, options: FileOptions(cacheControl: "3600", contentType: "image/jpeg", upsert: true))
          struct PhotoUpdate: Encodable { let photo_path: String }
          try await supabase.from("entries").update(PhotoUpdate(photo_path: path)).eq("id", value: draft.id).execute()
        } catch {
          Log.data.error("Saving the photo failed: \(error.localizedDescription, privacy: .public)")
          photoFailed = true
        }
      }
      return Saved(id: draft.id, photoFailed: photoFailed)
    } catch {
      Log.data.error("Saving the entry failed at \(step, privacy: .public): \(error.localizedDescription, privacy: .public)")
      throw SaveError.step(step, error)
    }
  }

  /// Deletes an entry and its photo.
  static func delete(_ entry: Entry) async throws {
    try await supabase.from("entries").delete().eq("id", value: entry.id).execute()
    if let path = entry.photoPath {
      _ = try? await supabase.storage.from(photoBucket).remove(paths: [path])
    }
  }
}

extension Optional {
  func asyncMap<T>(_ transform: (Wrapped) async throws -> T) async rethrows -> T? {
    guard let self else { return nil }
    return try await transform(self)
  }
}

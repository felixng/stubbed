import Foundation
import Supabase

/// How the signed-in viewer relates to a profile: theirs, or their follow
/// status with it.
struct Viewer: Hashable, Sendable {
  enum Status: String, Sendable { case none, pending, accepted }
  var isOwner: Bool
  var status: Status
  /// You've blocked them (#144).
  var blocked = false
}

/// What other people see: public profiles, entries and trips, like the
/// web's /@handle, /e/:id and /t/:id. Only public, logged shows, the same
/// as RLS enforces for anyone but the owner, so you see your own pages as
/// everyone else does.
enum PublicPages {
  struct ProfileStats: Decodable, Hashable, Sendable {
    var shows = 0
    var venues = 0
    var cities = 0
  }

  struct ProfilePage: Sendable {
    let profile: Profile
    let viewer: Viewer
    let follows: FollowCounts
    /// Nil for a private profile the viewer isn't approved to see.
    let stats: ProfileStats?
    let entries: [Entry]
    let photos: [String: URL]
    let reactions: [UUID: Reactions]
  }

  static func viewer(of profileId: UUID, me: UUID) async -> Viewer {
    if profileId == me { return Viewer(isOwner: true, status: .none) }
    struct Row: Decodable { let status: String }
    let rows: [Row] =
      (try? await supabase.from("follows").select("status").eq("follower_id", value: me)
        .eq("followee_id", value: profileId).limit(1).execute().value) ?? []
    return Viewer(isOwner: false, status: rows.first.flatMap { Viewer.Status(rawValue: $0.status) } ?? .none)
  }

  /// Nil when no profile has that handle.
  static func profile(handle: String, me: UUID) async throws -> ProfilePage? {
    let rows: [Profile] = try await supabase.from("profiles").select(Profile.select)
      .eq("handle", value: handle.lowercased()).limit(1).execute().value
    guard let profile = rows.first else { return nil }
    async let viewer = viewer(of: profile.id, me: me)
    async let follows = Profiles.followCounts(profile.id)
    async let blocked = profile.id == me ? false : Blocks.isBlocked(profile.id)
    var (v, f) = await (viewer, follows)
    v.blocked = await blocked
    // Someone you've blocked: the header and Unblock, nothing else.
    if v.blocked {
      return ProfilePage(profile: profile, viewer: v, follows: f, stats: nil, entries: [], photos: [:], reactions: [:])
    }

    // A private profile shows its header only, unless the viewer is approved
    // (or it's their own).
    if profile.isPrivate, !v.isOwner, v.status != .accepted {
      return ProfilePage(profile: profile, viewer: v, follows: f, stats: nil, entries: [], photos: [:], reactions: [:])
    }
    async let entries: [Entry] = supabase.from("entries").select(Entry.select).eq("user_id", value: profile.id)
      .eq("visibility", value: "public").eq("status", value: "logged")
      .order("date", ascending: false).order("created_at", ascending: false).execute().value
    async let stats: ProfileStats? = try? supabase.rpc("public_profile_stats", params: ["profile_id": profile.id])
      .single().execute().value
    let (list, s) = try await (entries, stats)
    async let photos = Entries.signPhotos(list.map(\.photoPath))
    async let reactions = ReactionsAPI.load(list.map(\.id))
    return ProfilePage(
      profile: profile, viewer: v, follows: f, stats: s ?? ProfileStats(), entries: list, photos: await photos,
      reactions: await reactions)
  }

  struct EntryPage: Sendable {
    let entry: Entry
    let owner: Person
    let photo: URL?
    let reactions: Reactions
  }

  /// A public show, or one the viewer may see (an approved follower of a
  /// private profile, or the owner). Nil otherwise.
  static func entry(_ id: UUID) async throws -> EntryPage? {
    let rows: [Entry] = try await supabase.from("entries").select(Entry.select).eq("id", value: id)
      .eq("visibility", value: "public").eq("status", value: "logged").limit(1).execute().value
    guard let entry = rows.first else { return nil }
    let owner: Person = try await supabase.from("profiles").select(Person.select).eq("id", value: entry.userId)
      .single().execute().value
    async let photo = Entries.signPhotos([entry.photoPath])
    async let reactions = ReactionsAPI.load([entry.id])
    let (signed, counts) = await (photo, reactions)
    return EntryPage(
      entry: entry, owner: owner, photo: entry.photoPath.flatMap { signed[$0] }, reactions: counts[entry.id] ?? Reactions())
  }

  struct TripPage: Sendable {
    let trip: Trip
    let owner: Person
    /// Its public shows, in date order.
    let entries: [Entry]
    let photos: [String: URL]
    let reactions: [UUID: Reactions]

    var venues: Int { Set(entries.compactMap { $0.venue?.id }).count }
    var nights: Int { Set(entries.map(\.date)).count }
    var cities: [String] {
      Array(Set(entries.compactMap { $0.venue?.city?.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }))
        .sorted()
    }
    var average: Double? {
      let rated = entries.compactMap(\.rating)
      return rated.isEmpty ? nil : rated.reduce(0, +) / Double(rated.count)
    }
    var place: String? { cities.count == 1 ? cities[0] : cities.count > 1 ? "\(cities.count) cities" : nil }
  }

  /// A trip with at least one public show; nil otherwise. Private shows in
  /// it are left out, and so are their counts.
  static func trip(_ id: UUID) async throws -> TripPage? {
    struct Row: Decodable {
      let trip: Trip
      let userId: UUID
      enum Keys: String, CodingKey { case user_id }
      init(from decoder: any Decoder) throws {
        trip = try Trip(from: decoder)
        userId = try decoder.container(keyedBy: Keys.self).decode(UUID.self, forKey: .user_id)
      }
    }
    let rows: [Row] = try await supabase.from("collections").select("\(Trip.select), user_id").eq("id", value: id)
      .eq("kind", value: "trip").limit(1).execute().value
    guard let row = rows.first else { return nil }
    async let owner: Person = supabase.from("profiles").select(Person.select).eq("id", value: row.userId).single()
      .execute().value
    async let all: [Entry] = supabase.from("entries").select(Entry.select).eq("user_id", value: row.userId)
      .eq("visibility", value: "public").eq("status", value: "logged")
      .gte("date", value: row.trip.startDate).lte("date", value: row.trip.endDate)
      .order("date", ascending: true).execute().value
    let (person, entries) = try await (owner, all)
    let inTrip = entries.filter { e in e.trips.contains { $0.id == id } }
    guard !inTrip.isEmpty else { return nil }
    async let photos = Entries.signPhotos(inTrip.map(\.photoPath))
    async let reactions = ReactionsAPI.load(inTrip.map(\.id))
    return TripPage(trip: row.trip, owner: person, entries: inTrip, photos: await photos, reactions: await reactions)
  }

  /// People by handle or name (`search_profiles`), handles first.
  static func search(_ query: String) async throws -> [Person] {
    try await supabase.rpc("search_profiles", params: ["q": query]).execute().value
  }
}

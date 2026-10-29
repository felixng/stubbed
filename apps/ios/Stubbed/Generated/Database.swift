import Foundation
import Supabase

internal enum GraphqlPublicSchema {
}
internal enum PublicSchema {
  internal enum CollectionKind: String, Codable, Hashable, Sendable {
    case trip = "trip"
    case label = "label"
  }
  internal enum EntryStatus: String, Codable, Hashable, Sendable {
    case planned = "planned"
    case logged = "logged"
  }
  internal enum ShowType: String, Codable, Hashable, Sendable {
    case musical = "musical"
    case play = "play"
    case opera = "opera"
    case dance = "dance"
    case comedy = "comedy"
    case standup = "standup"
    case other = "other"
  }
  internal enum Visibility: String, Codable, Hashable, Sendable {
    case `public` = "public"
    case `private` = "private"
  }
  internal struct BlocksSelect: Codable, Hashable, Sendable {
    internal let blockedId: UUID
    internal let blockerId: UUID
    internal let createdAt: String
    internal enum CodingKeys: String, CodingKey {
      case blockedId = "blocked_id"
      case blockerId = "blocker_id"
      case createdAt = "created_at"
    }
  }
  internal struct BlocksInsert: Codable, Hashable, Sendable {
    internal let blockedId: UUID
    internal let blockerId: UUID?
    internal let createdAt: String?
    internal enum CodingKeys: String, CodingKey {
      case blockedId = "blocked_id"
      case blockerId = "blocker_id"
      case createdAt = "created_at"
    }
  }
  internal struct BlocksUpdate: Codable, Hashable, Sendable {
    internal let blockedId: UUID?
    internal let blockerId: UUID?
    internal let createdAt: String?
    internal enum CodingKeys: String, CodingKey {
      case blockedId = "blocked_id"
      case blockerId = "blocker_id"
      case createdAt = "created_at"
    }
  }
  internal struct CollectionsSelect: Codable, Hashable, Sendable {
    internal let createdAt: String
    internal let endDate: String?
    internal let id: UUID
    internal let kind: CollectionKind
    internal let name: String
    internal let startDate: String?
    internal let userId: UUID
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case endDate = "end_date"
      case id = "id"
      case kind = "kind"
      case name = "name"
      case startDate = "start_date"
      case userId = "user_id"
    }
  }
  internal struct CollectionsInsert: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let endDate: String?
    internal let id: UUID?
    internal let kind: CollectionKind?
    internal let name: String
    internal let startDate: String?
    internal let userId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case endDate = "end_date"
      case id = "id"
      case kind = "kind"
      case name = "name"
      case startDate = "start_date"
      case userId = "user_id"
    }
  }
  internal struct CollectionsUpdate: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let endDate: String?
    internal let id: UUID?
    internal let kind: CollectionKind?
    internal let name: String?
    internal let startDate: String?
    internal let userId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case endDate = "end_date"
      case id = "id"
      case kind = "kind"
      case name = "name"
      case startDate = "start_date"
      case userId = "user_id"
    }
  }
  internal struct EntriesSelect: Codable, Hashable, Sendable {
    internal let createdAt: String
    internal let date: String
    internal let id: UUID
    internal let note: String?
    internal let photoPath: String?
    internal let rating: Decimal?
    internal let showId: UUID
    internal let status: EntryStatus
    internal let updatedAt: String
    internal let userId: UUID
    internal let venueId: UUID?
    internal let visibility: Visibility
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case date = "date"
      case id = "id"
      case note = "note"
      case photoPath = "photo_path"
      case rating = "rating"
      case showId = "show_id"
      case status = "status"
      case updatedAt = "updated_at"
      case userId = "user_id"
      case venueId = "venue_id"
      case visibility = "visibility"
    }
  }
  internal struct EntriesInsert: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let date: String
    internal let id: UUID?
    internal let note: String?
    internal let photoPath: String?
    internal let rating: Decimal?
    internal let showId: UUID
    internal let status: EntryStatus?
    internal let updatedAt: String?
    internal let userId: UUID?
    internal let venueId: UUID?
    internal let visibility: Visibility
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case date = "date"
      case id = "id"
      case note = "note"
      case photoPath = "photo_path"
      case rating = "rating"
      case showId = "show_id"
      case status = "status"
      case updatedAt = "updated_at"
      case userId = "user_id"
      case venueId = "venue_id"
      case visibility = "visibility"
    }
  }
  internal struct EntriesUpdate: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let date: String?
    internal let id: UUID?
    internal let note: String?
    internal let photoPath: String?
    internal let rating: Decimal?
    internal let showId: UUID?
    internal let status: EntryStatus?
    internal let updatedAt: String?
    internal let userId: UUID?
    internal let venueId: UUID?
    internal let visibility: Visibility?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case date = "date"
      case id = "id"
      case note = "note"
      case photoPath = "photo_path"
      case rating = "rating"
      case showId = "show_id"
      case status = "status"
      case updatedAt = "updated_at"
      case userId = "user_id"
      case venueId = "venue_id"
      case visibility = "visibility"
    }
  }
  internal struct EntryCollectionsSelect: Codable, Hashable, Sendable {
    internal let collectionId: UUID
    internal let createdAt: String
    internal let entryId: UUID
    internal enum CodingKeys: String, CodingKey {
      case collectionId = "collection_id"
      case createdAt = "created_at"
      case entryId = "entry_id"
    }
  }
  internal struct EntryCollectionsInsert: Codable, Hashable, Sendable {
    internal let collectionId: UUID
    internal let createdAt: String?
    internal let entryId: UUID
    internal enum CodingKeys: String, CodingKey {
      case collectionId = "collection_id"
      case createdAt = "created_at"
      case entryId = "entry_id"
    }
  }
  internal struct EntryCollectionsUpdate: Codable, Hashable, Sendable {
    internal let collectionId: UUID?
    internal let createdAt: String?
    internal let entryId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case collectionId = "collection_id"
      case createdAt = "created_at"
      case entryId = "entry_id"
    }
  }
  internal struct EntryCommentsSelect: Codable, Hashable, Sendable {
    internal let body: String
    internal let createdAt: String
    internal let entryId: UUID
    internal let id: UUID
    internal let userId: UUID
    internal enum CodingKeys: String, CodingKey {
      case body = "body"
      case createdAt = "created_at"
      case entryId = "entry_id"
      case id = "id"
      case userId = "user_id"
    }
  }
  internal struct EntryCommentsInsert: Codable, Hashable, Sendable {
    internal let body: String
    internal let createdAt: String?
    internal let entryId: UUID
    internal let id: UUID?
    internal let userId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case body = "body"
      case createdAt = "created_at"
      case entryId = "entry_id"
      case id = "id"
      case userId = "user_id"
    }
  }
  internal struct EntryCommentsUpdate: Codable, Hashable, Sendable {
    internal let body: String?
    internal let createdAt: String?
    internal let entryId: UUID?
    internal let id: UUID?
    internal let userId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case body = "body"
      case createdAt = "created_at"
      case entryId = "entry_id"
      case id = "id"
      case userId = "user_id"
    }
  }
  internal struct EntryLikesSelect: Codable, Hashable, Sendable {
    internal let createdAt: String
    internal let entryId: UUID
    internal let userId: UUID
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case entryId = "entry_id"
      case userId = "user_id"
    }
  }
  internal struct EntryLikesInsert: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let entryId: UUID
    internal let userId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case entryId = "entry_id"
      case userId = "user_id"
    }
  }
  internal struct EntryLikesUpdate: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let entryId: UUID?
    internal let userId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case entryId = "entry_id"
      case userId = "user_id"
    }
  }
  internal struct EventsSelect: Codable, Hashable, Sendable, Identifiable {
    internal let createdAt: String
    internal let id: Int64
    internal let name: String
    internal let props: AnyJSON
    internal let userId: UUID
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case id = "id"
      case name = "name"
      case props = "props"
      case userId = "user_id"
    }
  }
  internal struct EventsInsert: Codable, Hashable, Sendable, Identifiable {
    internal let createdAt: String?
    internal let id: Int64?
    internal let name: String
    internal let props: AnyJSON?
    internal let userId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case id = "id"
      case name = "name"
      case props = "props"
      case userId = "user_id"
    }
  }
  internal struct EventsUpdate: Codable, Hashable, Sendable, Identifiable {
    internal let createdAt: String?
    internal let id: Int64?
    internal let name: String?
    internal let props: AnyJSON?
    internal let userId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case id = "id"
      case name = "name"
      case props = "props"
      case userId = "user_id"
    }
  }
  internal struct FollowsSelect: Codable, Hashable, Sendable {
    internal let createdAt: String
    internal let followeeId: UUID
    internal let followerId: UUID
    internal let status: String
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case followeeId = "followee_id"
      case followerId = "follower_id"
      case status = "status"
    }
  }
  internal struct FollowsInsert: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let followeeId: UUID
    internal let followerId: UUID
    internal let status: String?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case followeeId = "followee_id"
      case followerId = "follower_id"
      case status = "status"
    }
  }
  internal struct FollowsUpdate: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let followeeId: UUID?
    internal let followerId: UUID?
    internal let status: String?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case followeeId = "followee_id"
      case followerId = "follower_id"
      case status = "status"
    }
  }
  internal struct ProfilesSelect: Codable, Hashable, Sendable {
    internal let avatarUrl: String?
    internal let bio: String?
    internal let createdAt: String
    internal let defaultVisibility: Visibility
    internal let displayName: String?
    internal let handle: String?
    internal let id: UUID
    internal let isPrivate: Bool
    internal let link: String?
    internal enum CodingKeys: String, CodingKey {
      case avatarUrl = "avatar_url"
      case bio = "bio"
      case createdAt = "created_at"
      case defaultVisibility = "default_visibility"
      case displayName = "display_name"
      case handle = "handle"
      case id = "id"
      case isPrivate = "is_private"
      case link = "link"
    }
  }
  internal struct ProfilesInsert: Codable, Hashable, Sendable {
    internal let avatarUrl: String?
    internal let bio: String?
    internal let createdAt: String?
    internal let defaultVisibility: Visibility?
    internal let displayName: String?
    internal let handle: String?
    internal let id: UUID
    internal let isPrivate: Bool?
    internal let link: String?
    internal enum CodingKeys: String, CodingKey {
      case avatarUrl = "avatar_url"
      case bio = "bio"
      case createdAt = "created_at"
      case defaultVisibility = "default_visibility"
      case displayName = "display_name"
      case handle = "handle"
      case id = "id"
      case isPrivate = "is_private"
      case link = "link"
    }
  }
  internal struct ProfilesUpdate: Codable, Hashable, Sendable {
    internal let avatarUrl: String?
    internal let bio: String?
    internal let createdAt: String?
    internal let defaultVisibility: Visibility?
    internal let displayName: String?
    internal let handle: String?
    internal let id: UUID?
    internal let isPrivate: Bool?
    internal let link: String?
    internal enum CodingKeys: String, CodingKey {
      case avatarUrl = "avatar_url"
      case bio = "bio"
      case createdAt = "created_at"
      case defaultVisibility = "default_visibility"
      case displayName = "display_name"
      case handle = "handle"
      case id = "id"
      case isPrivate = "is_private"
      case link = "link"
    }
  }
  internal struct ReportsSelect: Codable, Hashable, Sendable {
    internal let createdAt: String
    internal let id: UUID
    internal let note: String?
    internal let reason: String
    internal let reporterId: UUID
    internal let resolution: String?
    internal let resolvedAt: String?
    internal let snapshot: String?
    internal let targetId: UUID
    internal let targetOwner: UUID?
    internal let targetType: String
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case id = "id"
      case note = "note"
      case reason = "reason"
      case reporterId = "reporter_id"
      case resolution = "resolution"
      case resolvedAt = "resolved_at"
      case snapshot = "snapshot"
      case targetId = "target_id"
      case targetOwner = "target_owner"
      case targetType = "target_type"
    }
  }
  internal struct ReportsInsert: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let id: UUID?
    internal let note: String?
    internal let reason: String
    internal let reporterId: UUID?
    internal let resolution: String?
    internal let resolvedAt: String?
    internal let snapshot: String?
    internal let targetId: UUID
    internal let targetOwner: UUID?
    internal let targetType: String
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case id = "id"
      case note = "note"
      case reason = "reason"
      case reporterId = "reporter_id"
      case resolution = "resolution"
      case resolvedAt = "resolved_at"
      case snapshot = "snapshot"
      case targetId = "target_id"
      case targetOwner = "target_owner"
      case targetType = "target_type"
    }
  }
  internal struct ReportsUpdate: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let id: UUID?
    internal let note: String?
    internal let reason: String?
    internal let reporterId: UUID?
    internal let resolution: String?
    internal let resolvedAt: String?
    internal let snapshot: String?
    internal let targetId: UUID?
    internal let targetOwner: UUID?
    internal let targetType: String?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case id = "id"
      case note = "note"
      case reason = "reason"
      case reporterId = "reporter_id"
      case resolution = "resolution"
      case resolvedAt = "resolved_at"
      case snapshot = "snapshot"
      case targetId = "target_id"
      case targetOwner = "target_owner"
      case targetType = "target_type"
    }
  }
  internal struct ShowsSelect: Codable, Hashable, Sendable {
    internal let aliases: [String]
    internal let createdAt: String
    internal let createdBy: UUID?
    internal let firstPerformed: Int16?
    internal let id: UUID
    internal let title: String
    internal let type: ShowType
    internal let verified: Bool
    internal let wikidataId: String?
    internal enum CodingKeys: String, CodingKey {
      case aliases = "aliases"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case firstPerformed = "first_performed"
      case id = "id"
      case title = "title"
      case type = "type"
      case verified = "verified"
      case wikidataId = "wikidata_id"
    }
  }
  internal struct ShowsInsert: Codable, Hashable, Sendable {
    internal let aliases: [String]?
    internal let createdAt: String?
    internal let createdBy: UUID?
    internal let firstPerformed: Int16?
    internal let id: UUID?
    internal let title: String
    internal let type: ShowType?
    internal let verified: Bool?
    internal let wikidataId: String?
    internal enum CodingKeys: String, CodingKey {
      case aliases = "aliases"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case firstPerformed = "first_performed"
      case id = "id"
      case title = "title"
      case type = "type"
      case verified = "verified"
      case wikidataId = "wikidata_id"
    }
  }
  internal struct ShowsUpdate: Codable, Hashable, Sendable {
    internal let aliases: [String]?
    internal let createdAt: String?
    internal let createdBy: UUID?
    internal let firstPerformed: Int16?
    internal let id: UUID?
    internal let title: String?
    internal let type: ShowType?
    internal let verified: Bool?
    internal let wikidataId: String?
    internal enum CodingKeys: String, CodingKey {
      case aliases = "aliases"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case firstPerformed = "first_performed"
      case id = "id"
      case title = "title"
      case type = "type"
      case verified = "verified"
      case wikidataId = "wikidata_id"
    }
  }
  internal struct VenuesSelect: Codable, Hashable, Sendable {
    internal let city: String?
    internal let country: String?
    internal let createdAt: String
    internal let createdBy: UUID?
    internal let id: UUID
    internal let lat: Double?
    internal let lng: Double?
    internal let name: String
    internal let osmId: String?
    internal let verified: Bool
    internal enum CodingKeys: String, CodingKey {
      case city = "city"
      case country = "country"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case id = "id"
      case lat = "lat"
      case lng = "lng"
      case name = "name"
      case osmId = "osm_id"
      case verified = "verified"
    }
  }
  internal struct VenuesInsert: Codable, Hashable, Sendable {
    internal let city: String?
    internal let country: String?
    internal let createdAt: String?
    internal let createdBy: UUID?
    internal let id: UUID?
    internal let lat: Double?
    internal let lng: Double?
    internal let name: String
    internal let osmId: String?
    internal let verified: Bool?
    internal enum CodingKeys: String, CodingKey {
      case city = "city"
      case country = "country"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case id = "id"
      case lat = "lat"
      case lng = "lng"
      case name = "name"
      case osmId = "osm_id"
      case verified = "verified"
    }
  }
  internal struct VenuesUpdate: Codable, Hashable, Sendable {
    internal let city: String?
    internal let country: String?
    internal let createdAt: String?
    internal let createdBy: UUID?
    internal let id: UUID?
    internal let lat: Double?
    internal let lng: Double?
    internal let name: String?
    internal let osmId: String?
    internal let verified: Bool?
    internal enum CodingKeys: String, CodingKey {
      case city = "city"
      case country = "country"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case id = "id"
      case lat = "lat"
      case lng = "lng"
      case name = "name"
      case osmId = "osm_id"
      case verified = "verified"
    }
  }
  internal struct WaitlistSelect: Codable, Hashable, Sendable {
    internal let createdAt: String
    internal let email: String
    internal let id: UUID
    internal let source: String?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case email = "email"
      case id = "id"
      case source = "source"
    }
  }
  internal struct WaitlistInsert: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let email: String
    internal let id: UUID?
    internal let source: String?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case email = "email"
      case id = "id"
      case source = "source"
    }
  }
  internal struct WaitlistUpdate: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let email: String?
    internal let id: UUID?
    internal let source: String?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case email = "email"
      case id = "id"
      case source = "source"
    }
  }
}

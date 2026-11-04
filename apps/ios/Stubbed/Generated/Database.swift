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
  internal enum NotificationCategory: String, Codable, Hashable, Sendable {
    case like = "like"
    case comment = "comment"
    case follower = "follower"
    case followRequest = "follow_request"
    case followAccepted = "follow_accepted"
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
  internal enum VenueCircuit: String, Codable, Hashable, Sendable {
    case westEnd = "west_end"
    case offWestEnd = "off_west_end"
    case pub = "pub"
    case broadway = "broadway"
    case offBroadway = "off_broadway"
    case regionalUk = "regional_uk"
    case regionalUs = "regional_us"
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
  internal struct CrawlFindingsSelect: Codable, Hashable, Sendable {
    internal let confidence: Decimal
    internal let createdAt: String
    internal let dateText: String?
    internal let endDate: String?
    internal let evidence: String?
    internal let id: UUID
    internal let kind: String
    internal let method: String
    internal let rawTitle: String
    internal let review: String?
    internal let reviewNote: String?
    internal let runId: UUID
    internal let sourceUrl: String
    internal let stageText: String?
    internal let startDate: String?
    internal let venueId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case confidence = "confidence"
      case createdAt = "created_at"
      case dateText = "date_text"
      case endDate = "end_date"
      case evidence = "evidence"
      case id = "id"
      case kind = "kind"
      case method = "method"
      case rawTitle = "raw_title"
      case review = "review"
      case reviewNote = "review_note"
      case runId = "run_id"
      case sourceUrl = "source_url"
      case stageText = "stage_text"
      case startDate = "start_date"
      case venueId = "venue_id"
    }
  }
  internal struct CrawlFindingsInsert: Codable, Hashable, Sendable {
    internal let confidence: Decimal?
    internal let createdAt: String?
    internal let dateText: String?
    internal let endDate: String?
    internal let evidence: String?
    internal let id: UUID?
    internal let kind: String?
    internal let method: String
    internal let rawTitle: String
    internal let review: String?
    internal let reviewNote: String?
    internal let runId: UUID
    internal let sourceUrl: String
    internal let stageText: String?
    internal let startDate: String?
    internal let venueId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case confidence = "confidence"
      case createdAt = "created_at"
      case dateText = "date_text"
      case endDate = "end_date"
      case evidence = "evidence"
      case id = "id"
      case kind = "kind"
      case method = "method"
      case rawTitle = "raw_title"
      case review = "review"
      case reviewNote = "review_note"
      case runId = "run_id"
      case sourceUrl = "source_url"
      case stageText = "stage_text"
      case startDate = "start_date"
      case venueId = "venue_id"
    }
  }
  internal struct CrawlFindingsUpdate: Codable, Hashable, Sendable {
    internal let confidence: Decimal?
    internal let createdAt: String?
    internal let dateText: String?
    internal let endDate: String?
    internal let evidence: String?
    internal let id: UUID?
    internal let kind: String?
    internal let method: String?
    internal let rawTitle: String?
    internal let review: String?
    internal let reviewNote: String?
    internal let runId: UUID?
    internal let sourceUrl: String?
    internal let stageText: String?
    internal let startDate: String?
    internal let venueId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case confidence = "confidence"
      case createdAt = "created_at"
      case dateText = "date_text"
      case endDate = "end_date"
      case evidence = "evidence"
      case id = "id"
      case kind = "kind"
      case method = "method"
      case rawTitle = "raw_title"
      case review = "review"
      case reviewNote = "review_note"
      case runId = "run_id"
      case sourceUrl = "source_url"
      case stageText = "stage_text"
      case startDate = "start_date"
      case venueId = "venue_id"
    }
  }
  internal struct CrawlMissedSelect: Codable, Hashable, Sendable {
    internal let createdAt: String
    internal let id: UUID
    internal let note: String?
    internal let runId: UUID
    internal let title: String
    internal let venueId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case id = "id"
      case note = "note"
      case runId = "run_id"
      case title = "title"
      case venueId = "venue_id"
    }
  }
  internal struct CrawlMissedInsert: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let id: UUID?
    internal let note: String?
    internal let runId: UUID
    internal let title: String
    internal let venueId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case id = "id"
      case note = "note"
      case runId = "run_id"
      case title = "title"
      case venueId = "venue_id"
    }
  }
  internal struct CrawlMissedUpdate: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let id: UUID?
    internal let note: String?
    internal let runId: UUID?
    internal let title: String?
    internal let venueId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case id = "id"
      case note = "note"
      case runId = "run_id"
      case title = "title"
      case venueId = "venue_id"
    }
  }
  internal struct CrawlRunsSelect: Codable, Hashable, Sendable {
    internal let branch: String?
    internal let budgetUsd: Decimal
    internal let commitSha: String?
    internal let costUsd: Decimal
    internal let createdAt: String
    internal let createdBy: UUID?
    internal let finishedAt: String?
    internal let id: UUID
    internal let kind: String
    internal let logUrl: String?
    internal let method: String
    internal let model: String?
    internal let prompt: String?
    internal let startedAt: String?
    internal let status: String
    internal let summary: AnyJSON
    internal let venueIds: [UUID]
    internal enum CodingKeys: String, CodingKey {
      case branch = "branch"
      case budgetUsd = "budget_usd"
      case commitSha = "commit_sha"
      case costUsd = "cost_usd"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case finishedAt = "finished_at"
      case id = "id"
      case kind = "kind"
      case logUrl = "log_url"
      case method = "method"
      case model = "model"
      case prompt = "prompt"
      case startedAt = "started_at"
      case status = "status"
      case summary = "summary"
      case venueIds = "venue_ids"
    }
  }
  internal struct CrawlRunsInsert: Codable, Hashable, Sendable {
    internal let branch: String?
    internal let budgetUsd: Decimal?
    internal let commitSha: String?
    internal let costUsd: Decimal?
    internal let createdAt: String?
    internal let createdBy: UUID?
    internal let finishedAt: String?
    internal let id: UUID?
    internal let kind: String?
    internal let logUrl: String?
    internal let method: String?
    internal let model: String?
    internal let prompt: String?
    internal let startedAt: String?
    internal let status: String?
    internal let summary: AnyJSON?
    internal let venueIds: [UUID]?
    internal enum CodingKeys: String, CodingKey {
      case branch = "branch"
      case budgetUsd = "budget_usd"
      case commitSha = "commit_sha"
      case costUsd = "cost_usd"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case finishedAt = "finished_at"
      case id = "id"
      case kind = "kind"
      case logUrl = "log_url"
      case method = "method"
      case model = "model"
      case prompt = "prompt"
      case startedAt = "started_at"
      case status = "status"
      case summary = "summary"
      case venueIds = "venue_ids"
    }
  }
  internal struct CrawlRunsUpdate: Codable, Hashable, Sendable {
    internal let branch: String?
    internal let budgetUsd: Decimal?
    internal let commitSha: String?
    internal let costUsd: Decimal?
    internal let createdAt: String?
    internal let createdBy: UUID?
    internal let finishedAt: String?
    internal let id: UUID?
    internal let kind: String?
    internal let logUrl: String?
    internal let method: String?
    internal let model: String?
    internal let prompt: String?
    internal let startedAt: String?
    internal let status: String?
    internal let summary: AnyJSON?
    internal let venueIds: [UUID]?
    internal enum CodingKeys: String, CodingKey {
      case branch = "branch"
      case budgetUsd = "budget_usd"
      case commitSha = "commit_sha"
      case costUsd = "cost_usd"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case finishedAt = "finished_at"
      case id = "id"
      case kind = "kind"
      case logUrl = "log_url"
      case method = "method"
      case model = "model"
      case prompt = "prompt"
      case startedAt = "started_at"
      case status = "status"
      case summary = "summary"
      case venueIds = "venue_ids"
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
    internal let notificationGeneration: UUID
    internal let userId: UUID
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case entryId = "entry_id"
      case notificationGeneration = "notification_generation"
      case userId = "user_id"
    }
  }
  internal struct EntryLikesInsert: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let entryId: UUID
    internal let notificationGeneration: UUID?
    internal let userId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case entryId = "entry_id"
      case notificationGeneration = "notification_generation"
      case userId = "user_id"
    }
  }
  internal struct EntryLikesUpdate: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let entryId: UUID?
    internal let notificationGeneration: UUID?
    internal let userId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case entryId = "entry_id"
      case notificationGeneration = "notification_generation"
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
    internal let notificationGeneration: UUID
    internal let status: String
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case followeeId = "followee_id"
      case followerId = "follower_id"
      case notificationGeneration = "notification_generation"
      case status = "status"
    }
  }
  internal struct FollowsInsert: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let followeeId: UUID
    internal let followerId: UUID
    internal let notificationGeneration: UUID?
    internal let status: String?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case followeeId = "followee_id"
      case followerId = "follower_id"
      case notificationGeneration = "notification_generation"
      case status = "status"
    }
  }
  internal struct FollowsUpdate: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let followeeId: UUID?
    internal let followerId: UUID?
    internal let notificationGeneration: UUID?
    internal let status: String?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case followeeId = "followee_id"
      case followerId = "follower_id"
      case notificationGeneration = "notification_generation"
      case status = "status"
    }
  }
  internal struct NotificationCategoryPreferencesSelect: Codable, Hashable, Sendable {
    internal let category: NotificationCategory
    internal let push: Bool
    internal let userId: UUID
    internal enum CodingKeys: String, CodingKey {
      case category = "category"
      case push = "push"
      case userId = "user_id"
    }
  }
  internal struct NotificationCategoryPreferencesInsert: Codable, Hashable, Sendable {
    internal let category: NotificationCategory
    internal let push: Bool?
    internal let userId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case category = "category"
      case push = "push"
      case userId = "user_id"
    }
  }
  internal struct NotificationCategoryPreferencesUpdate: Codable, Hashable, Sendable {
    internal let category: NotificationCategory?
    internal let push: Bool?
    internal let userId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case category = "category"
      case push = "push"
      case userId = "user_id"
    }
  }
  internal struct NotificationDeliveriesSelect: Codable, Hashable, Sendable {
    internal let attempts: Int32
    internal let availableAt: String
    internal let destinationId: UUID
    internal let expiresAt: String
    internal let id: UUID
    internal let lease: UUID?
    internal let leaseUntil: String?
    internal let notificationId: UUID
    internal let outcome: String?
    internal let revision: Int64
    internal let status: String
    internal enum CodingKeys: String, CodingKey {
      case attempts = "attempts"
      case availableAt = "available_at"
      case destinationId = "destination_id"
      case expiresAt = "expires_at"
      case id = "id"
      case lease = "lease"
      case leaseUntil = "lease_until"
      case notificationId = "notification_id"
      case outcome = "outcome"
      case revision = "revision"
      case status = "status"
    }
  }
  internal struct NotificationDeliveriesInsert: Codable, Hashable, Sendable {
    internal let attempts: Int32?
    internal let availableAt: String
    internal let destinationId: UUID
    internal let expiresAt: String
    internal let id: UUID?
    internal let lease: UUID?
    internal let leaseUntil: String?
    internal let notificationId: UUID
    internal let outcome: String?
    internal let revision: Int64
    internal let status: String?
    internal enum CodingKeys: String, CodingKey {
      case attempts = "attempts"
      case availableAt = "available_at"
      case destinationId = "destination_id"
      case expiresAt = "expires_at"
      case id = "id"
      case lease = "lease"
      case leaseUntil = "lease_until"
      case notificationId = "notification_id"
      case outcome = "outcome"
      case revision = "revision"
      case status = "status"
    }
  }
  internal struct NotificationDeliveriesUpdate: Codable, Hashable, Sendable {
    internal let attempts: Int32?
    internal let availableAt: String?
    internal let destinationId: UUID?
    internal let expiresAt: String?
    internal let id: UUID?
    internal let lease: UUID?
    internal let leaseUntil: String?
    internal let notificationId: UUID?
    internal let outcome: String?
    internal let revision: Int64?
    internal let status: String?
    internal enum CodingKeys: String, CodingKey {
      case attempts = "attempts"
      case availableAt = "available_at"
      case destinationId = "destination_id"
      case expiresAt = "expires_at"
      case id = "id"
      case lease = "lease"
      case leaseUntil = "lease_until"
      case notificationId = "notification_id"
      case outcome = "outcome"
      case revision = "revision"
      case status = "status"
    }
  }
  internal struct NotificationEventsSelect: Codable, Hashable, Sendable {
    internal let actorId: UUID
    internal let commentId: UUID?
    internal let createdAt: String
    internal let notificationId: UUID
    internal let sourceKey: String
    internal enum CodingKeys: String, CodingKey {
      case actorId = "actor_id"
      case commentId = "comment_id"
      case createdAt = "created_at"
      case notificationId = "notification_id"
      case sourceKey = "source_key"
    }
  }
  internal struct NotificationEventsInsert: Codable, Hashable, Sendable {
    internal let actorId: UUID
    internal let commentId: UUID?
    internal let createdAt: String?
    internal let notificationId: UUID
    internal let sourceKey: String
    internal enum CodingKeys: String, CodingKey {
      case actorId = "actor_id"
      case commentId = "comment_id"
      case createdAt = "created_at"
      case notificationId = "notification_id"
      case sourceKey = "source_key"
    }
  }
  internal struct NotificationEventsUpdate: Codable, Hashable, Sendable {
    internal let actorId: UUID?
    internal let commentId: UUID?
    internal let createdAt: String?
    internal let notificationId: UUID?
    internal let sourceKey: String?
    internal enum CodingKeys: String, CodingKey {
      case actorId = "actor_id"
      case commentId = "comment_id"
      case createdAt = "created_at"
      case notificationId = "notification_id"
      case sourceKey = "source_key"
    }
  }
  internal struct NotificationOutboxSelect: Codable, Hashable, Sendable {
    internal let actorId: UUID?
    internal let availableAt: String
    internal let expiresAt: String
    internal let notificationId: UUID
    internal let queuedAt: String
    internal let revision: Int64
    internal let sourceKey: String?
    internal enum CodingKeys: String, CodingKey {
      case actorId = "actor_id"
      case availableAt = "available_at"
      case expiresAt = "expires_at"
      case notificationId = "notification_id"
      case queuedAt = "queued_at"
      case revision = "revision"
      case sourceKey = "source_key"
    }
  }
  internal struct NotificationOutboxInsert: Codable, Hashable, Sendable {
    internal let actorId: UUID?
    internal let availableAt: String
    internal let expiresAt: String
    internal let notificationId: UUID
    internal let queuedAt: String?
    internal let revision: Int64
    internal let sourceKey: String?
    internal enum CodingKeys: String, CodingKey {
      case actorId = "actor_id"
      case availableAt = "available_at"
      case expiresAt = "expires_at"
      case notificationId = "notification_id"
      case queuedAt = "queued_at"
      case revision = "revision"
      case sourceKey = "source_key"
    }
  }
  internal struct NotificationOutboxUpdate: Codable, Hashable, Sendable {
    internal let actorId: UUID?
    internal let availableAt: String?
    internal let expiresAt: String?
    internal let notificationId: UUID?
    internal let queuedAt: String?
    internal let revision: Int64?
    internal let sourceKey: String?
    internal enum CodingKeys: String, CodingKey {
      case actorId = "actor_id"
      case availableAt = "available_at"
      case expiresAt = "expires_at"
      case notificationId = "notification_id"
      case queuedAt = "queued_at"
      case revision = "revision"
      case sourceKey = "source_key"
    }
  }
  internal struct NotificationPolicySelect: Codable, Hashable, Sendable {
    internal let inboxRetention: String
    internal let leaseDuration: String
    internal let likeGroupWindow: String
    internal let likePushDelay: String
    internal let pushExpiry: String
    internal let repeatPushCooldown: String
    internal let retryDelaysSeconds: [Int32]
    internal let singleton: Bool
    internal enum CodingKeys: String, CodingKey {
      case inboxRetention = "inbox_retention"
      case leaseDuration = "lease_duration"
      case likeGroupWindow = "like_group_window"
      case likePushDelay = "like_push_delay"
      case pushExpiry = "push_expiry"
      case repeatPushCooldown = "repeat_push_cooldown"
      case retryDelaysSeconds = "retry_delays_seconds"
      case singleton = "singleton"
    }
  }
  internal struct NotificationPolicyInsert: Codable, Hashable, Sendable {
    internal let inboxRetention: String?
    internal let leaseDuration: String?
    internal let likeGroupWindow: String?
    internal let likePushDelay: String?
    internal let pushExpiry: String?
    internal let repeatPushCooldown: String?
    internal let retryDelaysSeconds: [Int32]?
    internal let singleton: Bool?
    internal enum CodingKeys: String, CodingKey {
      case inboxRetention = "inbox_retention"
      case leaseDuration = "lease_duration"
      case likeGroupWindow = "like_group_window"
      case likePushDelay = "like_push_delay"
      case pushExpiry = "push_expiry"
      case repeatPushCooldown = "repeat_push_cooldown"
      case retryDelaysSeconds = "retry_delays_seconds"
      case singleton = "singleton"
    }
  }
  internal struct NotificationPolicyUpdate: Codable, Hashable, Sendable {
    internal let inboxRetention: String?
    internal let leaseDuration: String?
    internal let likeGroupWindow: String?
    internal let likePushDelay: String?
    internal let pushExpiry: String?
    internal let repeatPushCooldown: String?
    internal let retryDelaysSeconds: [Int32]?
    internal let singleton: Bool?
    internal enum CodingKeys: String, CodingKey {
      case inboxRetention = "inbox_retention"
      case leaseDuration = "lease_duration"
      case likeGroupWindow = "like_group_window"
      case likePushDelay = "like_push_delay"
      case pushExpiry = "push_expiry"
      case repeatPushCooldown = "repeat_push_cooldown"
      case retryDelaysSeconds = "retry_delays_seconds"
      case singleton = "singleton"
    }
  }
  internal struct NotificationsSelect: Codable, Hashable, Sendable {
    internal let category: NotificationCategory
    internal let createdAt: String
    internal let entryId: UUID?
    internal let id: UUID
    internal let readRevision: Int64
    internal let recipientId: UUID
    internal let revision: Int64
    internal let updatedAt: String
    internal enum CodingKeys: String, CodingKey {
      case category = "category"
      case createdAt = "created_at"
      case entryId = "entry_id"
      case id = "id"
      case readRevision = "read_revision"
      case recipientId = "recipient_id"
      case revision = "revision"
      case updatedAt = "updated_at"
    }
  }
  internal struct NotificationsInsert: Codable, Hashable, Sendable {
    internal let category: NotificationCategory
    internal let createdAt: String?
    internal let entryId: UUID?
    internal let id: UUID?
    internal let readRevision: Int64?
    internal let recipientId: UUID
    internal let revision: Int64?
    internal let updatedAt: String?
    internal enum CodingKeys: String, CodingKey {
      case category = "category"
      case createdAt = "created_at"
      case entryId = "entry_id"
      case id = "id"
      case readRevision = "read_revision"
      case recipientId = "recipient_id"
      case revision = "revision"
      case updatedAt = "updated_at"
    }
  }
  internal struct NotificationsUpdate: Codable, Hashable, Sendable {
    internal let category: NotificationCategory?
    internal let createdAt: String?
    internal let entryId: UUID?
    internal let id: UUID?
    internal let readRevision: Int64?
    internal let recipientId: UUID?
    internal let revision: Int64?
    internal let updatedAt: String?
    internal enum CodingKeys: String, CodingKey {
      case category = "category"
      case createdAt = "created_at"
      case entryId = "entry_id"
      case id = "id"
      case readRevision = "read_revision"
      case recipientId = "recipient_id"
      case revision = "revision"
      case updatedAt = "updated_at"
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
  internal struct PushDestinationsSelect: Codable, Hashable, Sendable {
    internal let apnsEnvironment: String?
    internal let createdAt: String
    internal let id: UUID
    internal let kind: String
    internal let nativeToken: String?
    internal let secretHash: String
    internal let updatedAt: String
    internal let userId: UUID
    internal let webAuth: String?
    internal let webEndpoint: String?
    internal let webP256dh: String?
    internal enum CodingKeys: String, CodingKey {
      case apnsEnvironment = "apns_environment"
      case createdAt = "created_at"
      case id = "id"
      case kind = "kind"
      case nativeToken = "native_token"
      case secretHash = "secret_hash"
      case updatedAt = "updated_at"
      case userId = "user_id"
      case webAuth = "web_auth"
      case webEndpoint = "web_endpoint"
      case webP256dh = "web_p256dh"
    }
  }
  internal struct PushDestinationsInsert: Codable, Hashable, Sendable {
    internal let apnsEnvironment: String?
    internal let createdAt: String?
    internal let id: UUID
    internal let kind: String
    internal let nativeToken: String?
    internal let secretHash: String
    internal let updatedAt: String?
    internal let userId: UUID
    internal let webAuth: String?
    internal let webEndpoint: String?
    internal let webP256dh: String?
    internal enum CodingKeys: String, CodingKey {
      case apnsEnvironment = "apns_environment"
      case createdAt = "created_at"
      case id = "id"
      case kind = "kind"
      case nativeToken = "native_token"
      case secretHash = "secret_hash"
      case updatedAt = "updated_at"
      case userId = "user_id"
      case webAuth = "web_auth"
      case webEndpoint = "web_endpoint"
      case webP256dh = "web_p256dh"
    }
  }
  internal struct PushDestinationsUpdate: Codable, Hashable, Sendable {
    internal let apnsEnvironment: String?
    internal let createdAt: String?
    internal let id: UUID?
    internal let kind: String?
    internal let nativeToken: String?
    internal let secretHash: String?
    internal let updatedAt: String?
    internal let userId: UUID?
    internal let webAuth: String?
    internal let webEndpoint: String?
    internal let webP256dh: String?
    internal enum CodingKeys: String, CodingKey {
      case apnsEnvironment = "apns_environment"
      case createdAt = "created_at"
      case id = "id"
      case kind = "kind"
      case nativeToken = "native_token"
      case secretHash = "secret_hash"
      case updatedAt = "updated_at"
      case userId = "user_id"
      case webAuth = "web_auth"
      case webEndpoint = "web_endpoint"
      case webP256dh = "web_p256dh"
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
  internal struct ShowAliasesSelect: Codable, Hashable, Sendable {
    internal let alias: String
    internal let createdAt: String
    internal let createdBy: UUID?
    internal let id: UUID
    internal let searchText: String?
    internal let showId: UUID
    internal enum CodingKeys: String, CodingKey {
      case alias = "alias"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case id = "id"
      case searchText = "search_text"
      case showId = "show_id"
    }
  }
  internal struct ShowAliasesInsert: Codable, Hashable, Sendable {
    internal let alias: String
    internal let createdAt: String?
    internal let createdBy: UUID?
    internal let id: UUID?
    internal let searchText: String?
    internal let showId: UUID
    internal enum CodingKeys: String, CodingKey {
      case alias = "alias"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case id = "id"
      case searchText = "search_text"
      case showId = "show_id"
    }
  }
  internal struct ShowAliasesUpdate: Codable, Hashable, Sendable {
    internal let alias: String?
    internal let createdAt: String?
    internal let createdBy: UUID?
    internal let id: UUID?
    internal let searchText: String?
    internal let showId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case alias = "alias"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case id = "id"
      case searchText = "search_text"
      case showId = "show_id"
    }
  }
  internal struct ShowsSelect: Codable, Hashable, Sendable {
    internal let aliases: [String]
    internal let createdAt: String
    internal let createdBy: UUID?
    internal let firstPerformed: Int16?
    internal let id: UUID
    internal let searchText: String?
    internal let title: String
    internal let titleLocked: Bool
    internal let type: ShowType
    internal let verified: Bool
    internal let wikidataId: String?
    internal enum CodingKeys: String, CodingKey {
      case aliases = "aliases"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case firstPerformed = "first_performed"
      case id = "id"
      case searchText = "search_text"
      case title = "title"
      case titleLocked = "title_locked"
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
    internal let searchText: String?
    internal let title: String
    internal let titleLocked: Bool?
    internal let type: ShowType?
    internal let verified: Bool?
    internal let wikidataId: String?
    internal enum CodingKeys: String, CodingKey {
      case aliases = "aliases"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case firstPerformed = "first_performed"
      case id = "id"
      case searchText = "search_text"
      case title = "title"
      case titleLocked = "title_locked"
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
    internal let searchText: String?
    internal let title: String?
    internal let titleLocked: Bool?
    internal let type: ShowType?
    internal let verified: Bool?
    internal let wikidataId: String?
    internal enum CodingKeys: String, CodingKey {
      case aliases = "aliases"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case firstPerformed = "first_performed"
      case id = "id"
      case searchText = "search_text"
      case title = "title"
      case titleLocked = "title_locked"
      case type = "type"
      case verified = "verified"
      case wikidataId = "wikidata_id"
    }
  }
  internal struct VenuesSelect: Codable, Hashable, Sendable {
    internal let circuit: VenueCircuit?
    internal let city: String?
    internal let country: String?
    internal let createdAt: String
    internal let createdBy: UUID?
    internal let id: UUID
    internal let lat: Double?
    internal let lng: Double?
    internal let name: String
    internal let osmId: String?
    internal let searchText: String?
    internal let source: String
    internal let verified: Bool
    internal let website: String?
    internal let whatsOnUrl: String?
    internal let wikidataId: String?
    internal enum CodingKeys: String, CodingKey {
      case circuit = "circuit"
      case city = "city"
      case country = "country"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case id = "id"
      case lat = "lat"
      case lng = "lng"
      case name = "name"
      case osmId = "osm_id"
      case searchText = "search_text"
      case source = "source"
      case verified = "verified"
      case website = "website"
      case whatsOnUrl = "whats_on_url"
      case wikidataId = "wikidata_id"
    }
  }
  internal struct VenuesInsert: Codable, Hashable, Sendable {
    internal let circuit: VenueCircuit?
    internal let city: String?
    internal let country: String?
    internal let createdAt: String?
    internal let createdBy: UUID?
    internal let id: UUID?
    internal let lat: Double?
    internal let lng: Double?
    internal let name: String
    internal let osmId: String?
    internal let searchText: String?
    internal let source: String?
    internal let verified: Bool?
    internal let website: String?
    internal let whatsOnUrl: String?
    internal let wikidataId: String?
    internal enum CodingKeys: String, CodingKey {
      case circuit = "circuit"
      case city = "city"
      case country = "country"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case id = "id"
      case lat = "lat"
      case lng = "lng"
      case name = "name"
      case osmId = "osm_id"
      case searchText = "search_text"
      case source = "source"
      case verified = "verified"
      case website = "website"
      case whatsOnUrl = "whats_on_url"
      case wikidataId = "wikidata_id"
    }
  }
  internal struct VenuesUpdate: Codable, Hashable, Sendable {
    internal let circuit: VenueCircuit?
    internal let city: String?
    internal let country: String?
    internal let createdAt: String?
    internal let createdBy: UUID?
    internal let id: UUID?
    internal let lat: Double?
    internal let lng: Double?
    internal let name: String?
    internal let osmId: String?
    internal let searchText: String?
    internal let source: String?
    internal let verified: Bool?
    internal let website: String?
    internal let whatsOnUrl: String?
    internal let wikidataId: String?
    internal enum CodingKeys: String, CodingKey {
      case circuit = "circuit"
      case city = "city"
      case country = "country"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case id = "id"
      case lat = "lat"
      case lng = "lng"
      case name = "name"
      case osmId = "osm_id"
      case searchText = "search_text"
      case source = "source"
      case verified = "verified"
      case website = "website"
      case whatsOnUrl = "whats_on_url"
      case wikidataId = "wikidata_id"
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

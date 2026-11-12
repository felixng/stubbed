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
    case concert = "concert"
    case circus = "circus"
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
  internal struct AdminAlertsSelect: Codable, Hashable, Sendable {
    internal let attempts: Int32
    internal let createdAt: String
    internal let emailDoneAt: String?
    internal let id: UUID
    internal let kind: String
    internal let lastError: String?
    internal let lease: UUID?
    internal let leaseUntil: String?
    internal let nextAttemptAt: String
    internal let provider: String
    internal let pushDoneAt: String?
    internal let userId: UUID
    internal enum CodingKeys: String, CodingKey {
      case attempts = "attempts"
      case createdAt = "created_at"
      case emailDoneAt = "email_done_at"
      case id = "id"
      case kind = "kind"
      case lastError = "last_error"
      case lease = "lease"
      case leaseUntil = "lease_until"
      case nextAttemptAt = "next_attempt_at"
      case provider = "provider"
      case pushDoneAt = "push_done_at"
      case userId = "user_id"
    }
  }
  internal struct AdminAlertsInsert: Codable, Hashable, Sendable {
    internal let attempts: Int32?
    internal let createdAt: String?
    internal let emailDoneAt: String?
    internal let id: UUID?
    internal let kind: String
    internal let lastError: String?
    internal let lease: UUID?
    internal let leaseUntil: String?
    internal let nextAttemptAt: String?
    internal let provider: String?
    internal let pushDoneAt: String?
    internal let userId: UUID
    internal enum CodingKeys: String, CodingKey {
      case attempts = "attempts"
      case createdAt = "created_at"
      case emailDoneAt = "email_done_at"
      case id = "id"
      case kind = "kind"
      case lastError = "last_error"
      case lease = "lease"
      case leaseUntil = "lease_until"
      case nextAttemptAt = "next_attempt_at"
      case provider = "provider"
      case pushDoneAt = "push_done_at"
      case userId = "user_id"
    }
  }
  internal struct AdminAlertsUpdate: Codable, Hashable, Sendable {
    internal let attempts: Int32?
    internal let createdAt: String?
    internal let emailDoneAt: String?
    internal let id: UUID?
    internal let kind: String?
    internal let lastError: String?
    internal let lease: UUID?
    internal let leaseUntil: String?
    internal let nextAttemptAt: String?
    internal let provider: String?
    internal let pushDoneAt: String?
    internal let userId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case attempts = "attempts"
      case createdAt = "created_at"
      case emailDoneAt = "email_done_at"
      case id = "id"
      case kind = "kind"
      case lastError = "last_error"
      case lease = "lease"
      case leaseUntil = "lease_until"
      case nextAttemptAt = "next_attempt_at"
      case provider = "provider"
      case pushDoneAt = "push_done_at"
      case userId = "user_id"
    }
  }
  internal struct AppConfigSelect: Codable, Hashable, Sendable {
    internal let key: String
    internal let value: String
    internal enum CodingKeys: String, CodingKey {
      case key = "key"
      case value = "value"
    }
  }
  internal struct AppConfigInsert: Codable, Hashable, Sendable {
    internal let key: String
    internal let value: String
    internal enum CodingKeys: String, CodingKey {
      case key = "key"
      case value = "value"
    }
  }
  internal struct AppConfigUpdate: Codable, Hashable, Sendable {
    internal let key: String?
    internal let value: String?
    internal enum CodingKeys: String, CodingKey {
      case key = "key"
      case value = "value"
    }
  }
  internal struct BillingCustomerDeletionsSelect: Codable, Hashable, Sendable {
    internal let appUserId: String
    internal let queuedAt: String
    internal enum CodingKeys: String, CodingKey {
      case appUserId = "app_user_id"
      case queuedAt = "queued_at"
    }
  }
  internal struct BillingCustomerDeletionsInsert: Codable, Hashable, Sendable {
    internal let appUserId: String
    internal let queuedAt: String?
    internal enum CodingKeys: String, CodingKey {
      case appUserId = "app_user_id"
      case queuedAt = "queued_at"
    }
  }
  internal struct BillingCustomerDeletionsUpdate: Codable, Hashable, Sendable {
    internal let appUserId: String?
    internal let queuedAt: String?
    internal enum CodingKeys: String, CodingKey {
      case appUserId = "app_user_id"
      case queuedAt = "queued_at"
    }
  }
  internal struct BillingCustomersSelect: Codable, Hashable, Sendable {
    internal let createdAt: String
    internal let revenuecatAppUserId: String
    internal let userId: UUID
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case revenuecatAppUserId = "revenuecat_app_user_id"
      case userId = "user_id"
    }
  }
  internal struct BillingCustomersInsert: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let revenuecatAppUserId: String
    internal let userId: UUID
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case revenuecatAppUserId = "revenuecat_app_user_id"
      case userId = "user_id"
    }
  }
  internal struct BillingCustomersUpdate: Codable, Hashable, Sendable {
    internal let createdAt: String?
    internal let revenuecatAppUserId: String?
    internal let userId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case createdAt = "created_at"
      case revenuecatAppUserId = "revenuecat_app_user_id"
      case userId = "user_id"
    }
  }
  internal struct BillingEventsSelect: Codable, Hashable, Sendable {
    internal let error: String?
    internal let eventId: String
    internal let processedAt: String?
    internal let receivedAt: String
    internal let userId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case error = "error"
      case eventId = "event_id"
      case processedAt = "processed_at"
      case receivedAt = "received_at"
      case userId = "user_id"
    }
  }
  internal struct BillingEventsInsert: Codable, Hashable, Sendable {
    internal let error: String?
    internal let eventId: String
    internal let processedAt: String?
    internal let receivedAt: String?
    internal let userId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case error = "error"
      case eventId = "event_id"
      case processedAt = "processed_at"
      case receivedAt = "received_at"
      case userId = "user_id"
    }
  }
  internal struct BillingEventsUpdate: Codable, Hashable, Sendable {
    internal let error: String?
    internal let eventId: String?
    internal let processedAt: String?
    internal let receivedAt: String?
    internal let userId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case error = "error"
      case eventId = "event_id"
      case processedAt = "processed_at"
      case receivedAt = "received_at"
      case userId = "user_id"
    }
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
  internal struct CatalogueConsumerFlagsSelect: Codable, Hashable, Sendable {
    internal let enabled: Bool
    internal let flag: String
    internal let updatedAt: String
    internal enum CodingKeys: String, CodingKey {
      case enabled = "enabled"
      case flag = "flag"
      case updatedAt = "updated_at"
    }
  }
  internal struct CatalogueConsumerFlagsInsert: Codable, Hashable, Sendable {
    internal let enabled: Bool?
    internal let flag: String
    internal let updatedAt: String?
    internal enum CodingKeys: String, CodingKey {
      case enabled = "enabled"
      case flag = "flag"
      case updatedAt = "updated_at"
    }
  }
  internal struct CatalogueConsumerFlagsUpdate: Codable, Hashable, Sendable {
    internal let enabled: Bool?
    internal let flag: String?
    internal let updatedAt: String?
    internal enum CodingKeys: String, CodingKey {
      case enabled = "enabled"
      case flag = "flag"
      case updatedAt = "updated_at"
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
  internal struct CrawlAdminActionsSelect: Codable, Hashable, Sendable {
    internal let actorId: UUID?
    internal let affected: Int32
    internal let createdAt: String
    internal let generationId: UUID?
    internal let id: UUID
    internal let operation: String
    internal let sourceId: UUID
    internal let taskId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case actorId = "actor_id"
      case affected = "affected"
      case createdAt = "created_at"
      case generationId = "generation_id"
      case id = "id"
      case operation = "operation"
      case sourceId = "source_id"
      case taskId = "task_id"
    }
  }
  internal struct CrawlAdminActionsInsert: Codable, Hashable, Sendable {
    internal let actorId: UUID?
    internal let affected: Int32
    internal let createdAt: String?
    internal let generationId: UUID?
    internal let id: UUID?
    internal let operation: String
    internal let sourceId: UUID
    internal let taskId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case actorId = "actor_id"
      case affected = "affected"
      case createdAt = "created_at"
      case generationId = "generation_id"
      case id = "id"
      case operation = "operation"
      case sourceId = "source_id"
      case taskId = "task_id"
    }
  }
  internal struct CrawlAdminActionsUpdate: Codable, Hashable, Sendable {
    internal let actorId: UUID?
    internal let affected: Int32?
    internal let createdAt: String?
    internal let generationId: UUID?
    internal let id: UUID?
    internal let operation: String?
    internal let sourceId: UUID?
    internal let taskId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case actorId = "actor_id"
      case affected = "affected"
      case createdAt = "created_at"
      case generationId = "generation_id"
      case id = "id"
      case operation = "operation"
      case sourceId = "source_id"
      case taskId = "task_id"
    }
  }
  internal struct CrawlAiReservationsSelect: Codable, Hashable, Sendable {
    internal let actualUsd: Decimal?
    internal let createdAt: String
    internal let id: UUID
    internal let reservedUsd: Decimal
    internal let runId: UUID
    internal let siteKey: String
    internal enum CodingKeys: String, CodingKey {
      case actualUsd = "actual_usd"
      case createdAt = "created_at"
      case id = "id"
      case reservedUsd = "reserved_usd"
      case runId = "run_id"
      case siteKey = "site_key"
    }
  }
  internal struct CrawlAiReservationsInsert: Codable, Hashable, Sendable {
    internal let actualUsd: Decimal?
    internal let createdAt: String?
    internal let id: UUID?
    internal let reservedUsd: Decimal
    internal let runId: UUID
    internal let siteKey: String
    internal enum CodingKeys: String, CodingKey {
      case actualUsd = "actual_usd"
      case createdAt = "created_at"
      case id = "id"
      case reservedUsd = "reserved_usd"
      case runId = "run_id"
      case siteKey = "site_key"
    }
  }
  internal struct CrawlAiReservationsUpdate: Codable, Hashable, Sendable {
    internal let actualUsd: Decimal?
    internal let createdAt: String?
    internal let id: UUID?
    internal let reservedUsd: Decimal?
    internal let runId: UUID?
    internal let siteKey: String?
    internal enum CodingKeys: String, CodingKey {
      case actualUsd = "actual_usd"
      case createdAt = "created_at"
      case id = "id"
      case reservedUsd = "reserved_usd"
      case runId = "run_id"
      case siteKey = "site_key"
    }
  }
  internal struct CrawlDispatchLogSelect: Codable, Hashable, Sendable {
    internal let error: String?
    internal let id: UUID
    internal let outcome: String
    internal let requestId: Int64?
    internal let sentAt: String
    internal let statusCode: Int32?
    internal enum CodingKeys: String, CodingKey {
      case error = "error"
      case id = "id"
      case outcome = "outcome"
      case requestId = "request_id"
      case sentAt = "sent_at"
      case statusCode = "status_code"
    }
  }
  internal struct CrawlDispatchLogInsert: Codable, Hashable, Sendable {
    internal let error: String?
    internal let id: UUID?
    internal let outcome: String
    internal let requestId: Int64?
    internal let sentAt: String?
    internal let statusCode: Int32?
    internal enum CodingKeys: String, CodingKey {
      case error = "error"
      case id = "id"
      case outcome = "outcome"
      case requestId = "request_id"
      case sentAt = "sent_at"
      case statusCode = "status_code"
    }
  }
  internal struct CrawlDispatchLogUpdate: Codable, Hashable, Sendable {
    internal let error: String?
    internal let id: UUID?
    internal let outcome: String?
    internal let requestId: Int64?
    internal let sentAt: String?
    internal let statusCode: Int32?
    internal enum CodingKeys: String, CodingKey {
      case error = "error"
      case id = "id"
      case outcome = "outcome"
      case requestId = "request_id"
      case sentAt = "sent_at"
      case statusCode = "status_code"
    }
  }
  internal struct CrawlExtractionsSelect: Codable, Hashable, Sendable {
    internal let contentHash: String
    internal let extractedAt: String
    internal let id: UUID
    internal let observations: AnyJSON
    internal let parserVersion: String
    internal let taskId: UUID
    internal enum CodingKeys: String, CodingKey {
      case contentHash = "content_hash"
      case extractedAt = "extracted_at"
      case id = "id"
      case observations = "observations"
      case parserVersion = "parser_version"
      case taskId = "task_id"
    }
  }
  internal struct CrawlExtractionsInsert: Codable, Hashable, Sendable {
    internal let contentHash: String
    internal let extractedAt: String?
    internal let id: UUID?
    internal let observations: AnyJSON
    internal let parserVersion: String
    internal let taskId: UUID
    internal enum CodingKeys: String, CodingKey {
      case contentHash = "content_hash"
      case extractedAt = "extracted_at"
      case id = "id"
      case observations = "observations"
      case parserVersion = "parser_version"
      case taskId = "task_id"
    }
  }
  internal struct CrawlExtractionsUpdate: Codable, Hashable, Sendable {
    internal let contentHash: String?
    internal let extractedAt: String?
    internal let id: UUID?
    internal let observations: AnyJSON?
    internal let parserVersion: String?
    internal let taskId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case contentHash = "content_hash"
      case extractedAt = "extracted_at"
      case id = "id"
      case observations = "observations"
      case parserVersion = "parser_version"
      case taskId = "task_id"
    }
  }
  internal struct CrawlFindingsSelect: Codable, Hashable, Sendable {
    internal let confidence: Decimal
    internal let createdAt: String
    internal let dateText: String?
    internal let endDate: String?
    internal let evidence: String?
    internal let fetchedUrl: String?
    internal let id: UUID
    internal let kind: String
    internal let method: String
    internal let pageChecked: Bool
    internal let rawTitle: String
    internal let review: String?
    internal let reviewNote: String?
    internal let ruleId: UUID?
    internal let runId: UUID
    internal let sentToReviewAt: String?
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
      case fetchedUrl = "fetched_url"
      case id = "id"
      case kind = "kind"
      case method = "method"
      case pageChecked = "page_checked"
      case rawTitle = "raw_title"
      case review = "review"
      case reviewNote = "review_note"
      case ruleId = "rule_id"
      case runId = "run_id"
      case sentToReviewAt = "sent_to_review_at"
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
    internal let fetchedUrl: String?
    internal let id: UUID?
    internal let kind: String?
    internal let method: String
    internal let pageChecked: Bool?
    internal let rawTitle: String
    internal let review: String?
    internal let reviewNote: String?
    internal let ruleId: UUID?
    internal let runId: UUID
    internal let sentToReviewAt: String?
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
      case fetchedUrl = "fetched_url"
      case id = "id"
      case kind = "kind"
      case method = "method"
      case pageChecked = "page_checked"
      case rawTitle = "raw_title"
      case review = "review"
      case reviewNote = "review_note"
      case ruleId = "rule_id"
      case runId = "run_id"
      case sentToReviewAt = "sent_to_review_at"
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
    internal let fetchedUrl: String?
    internal let id: UUID?
    internal let kind: String?
    internal let method: String?
    internal let pageChecked: Bool?
    internal let rawTitle: String?
    internal let review: String?
    internal let reviewNote: String?
    internal let ruleId: UUID?
    internal let runId: UUID?
    internal let sentToReviewAt: String?
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
      case fetchedUrl = "fetched_url"
      case id = "id"
      case kind = "kind"
      case method = "method"
      case pageChecked = "page_checked"
      case rawTitle = "raw_title"
      case review = "review"
      case reviewNote = "review_note"
      case ruleId = "rule_id"
      case runId = "run_id"
      case sentToReviewAt = "sent_to_review_at"
      case sourceUrl = "source_url"
      case stageText = "stage_text"
      case startDate = "start_date"
      case venueId = "venue_id"
    }
  }
  internal struct CrawlGenerationsSelect: Codable, Hashable, Sendable {
    internal let completedAt: String?
    internal let enumerationStatus: String
    internal let id: UUID
    internal let isCurrent: Bool
    internal let pausedReason: String?
    internal let scopeKey: String
    internal let siteId: UUID?
    internal let sourceId: UUID
    internal let startedAt: String
    internal enum CodingKeys: String, CodingKey {
      case completedAt = "completed_at"
      case enumerationStatus = "enumeration_status"
      case id = "id"
      case isCurrent = "is_current"
      case pausedReason = "paused_reason"
      case scopeKey = "scope_key"
      case siteId = "site_id"
      case sourceId = "source_id"
      case startedAt = "started_at"
    }
  }
  internal struct CrawlGenerationsInsert: Codable, Hashable, Sendable {
    internal let completedAt: String?
    internal let enumerationStatus: String?
    internal let id: UUID?
    internal let isCurrent: Bool?
    internal let pausedReason: String?
    internal let scopeKey: String
    internal let siteId: UUID?
    internal let sourceId: UUID
    internal let startedAt: String?
    internal enum CodingKeys: String, CodingKey {
      case completedAt = "completed_at"
      case enumerationStatus = "enumeration_status"
      case id = "id"
      case isCurrent = "is_current"
      case pausedReason = "paused_reason"
      case scopeKey = "scope_key"
      case siteId = "site_id"
      case sourceId = "source_id"
      case startedAt = "started_at"
    }
  }
  internal struct CrawlGenerationsUpdate: Codable, Hashable, Sendable {
    internal let completedAt: String?
    internal let enumerationStatus: String?
    internal let id: UUID?
    internal let isCurrent: Bool?
    internal let pausedReason: String?
    internal let scopeKey: String?
    internal let siteId: UUID?
    internal let sourceId: UUID?
    internal let startedAt: String?
    internal enum CodingKeys: String, CodingKey {
      case completedAt = "completed_at"
      case enumerationStatus = "enumeration_status"
      case id = "id"
      case isCurrent = "is_current"
      case pausedReason = "paused_reason"
      case scopeKey = "scope_key"
      case siteId = "site_id"
      case sourceId = "source_id"
      case startedAt = "started_at"
    }
  }
  internal struct CrawlGeocodesSelect: Codable, Hashable, Sendable {
    internal let fetchedAt: String
    internal let found: Bool
    internal let lat: Double?
    internal let lng: Double?
    internal let provider: String
    internal let queryKey: String
    internal enum CodingKeys: String, CodingKey {
      case fetchedAt = "fetched_at"
      case found = "found"
      case lat = "lat"
      case lng = "lng"
      case provider = "provider"
      case queryKey = "query_key"
    }
  }
  internal struct CrawlGeocodesInsert: Codable, Hashable, Sendable {
    internal let fetchedAt: String?
    internal let found: Bool
    internal let lat: Double?
    internal let lng: Double?
    internal let provider: String
    internal let queryKey: String
    internal enum CodingKeys: String, CodingKey {
      case fetchedAt = "fetched_at"
      case found = "found"
      case lat = "lat"
      case lng = "lng"
      case provider = "provider"
      case queryKey = "query_key"
    }
  }
  internal struct CrawlGeocodesUpdate: Codable, Hashable, Sendable {
    internal let fetchedAt: String?
    internal let found: Bool?
    internal let lat: Double?
    internal let lng: Double?
    internal let provider: String?
    internal let queryKey: String?
    internal enum CodingKeys: String, CodingKey {
      case fetchedAt = "fetched_at"
      case found = "found"
      case lat = "lat"
      case lng = "lng"
      case provider = "provider"
      case queryKey = "query_key"
    }
  }
  internal struct CrawlHostsSelect: Codable, Hashable, Sendable {
    internal let availableAt: String
    internal let host: String
    internal let lastStartedAt: String
    internal let requestExpiresAt: String?
    internal let requestToken: UUID?
    internal let requests: Int64
    internal enum CodingKeys: String, CodingKey {
      case availableAt = "available_at"
      case host = "host"
      case lastStartedAt = "last_started_at"
      case requestExpiresAt = "request_expires_at"
      case requestToken = "request_token"
      case requests = "requests"
    }
  }
  internal struct CrawlHostsInsert: Codable, Hashable, Sendable {
    internal let availableAt: String?
    internal let host: String
    internal let lastStartedAt: String?
    internal let requestExpiresAt: String?
    internal let requestToken: UUID?
    internal let requests: Int64?
    internal enum CodingKeys: String, CodingKey {
      case availableAt = "available_at"
      case host = "host"
      case lastStartedAt = "last_started_at"
      case requestExpiresAt = "request_expires_at"
      case requestToken = "request_token"
      case requests = "requests"
    }
  }
  internal struct CrawlHostsUpdate: Codable, Hashable, Sendable {
    internal let availableAt: String?
    internal let host: String?
    internal let lastStartedAt: String?
    internal let requestExpiresAt: String?
    internal let requestToken: UUID?
    internal let requests: Int64?
    internal enum CodingKeys: String, CodingKey {
      case availableAt = "available_at"
      case host = "host"
      case lastStartedAt = "last_started_at"
      case requestExpiresAt = "request_expires_at"
      case requestToken = "request_token"
      case requests = "requests"
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
  internal struct CrawlPagesSelect: Codable, Hashable, Sendable {
    internal let etag: String?
    internal let failures: Int32
    internal let fingerprint: String?
    internal let lastModified: String?
    internal let lastRead: String?
    internal let nextUrl: String?
    internal let readableShare: Decimal
    internal let resultCount: Int32
    internal let ruleId: UUID?
    internal let siteId: UUID
    internal let status: String
    internal let titles: AnyJSON
    internal let type: String
    internal let url: String
    internal enum CodingKeys: String, CodingKey {
      case etag = "etag"
      case failures = "failures"
      case fingerprint = "fingerprint"
      case lastModified = "last_modified"
      case lastRead = "last_read"
      case nextUrl = "next_url"
      case readableShare = "readable_share"
      case resultCount = "result_count"
      case ruleId = "rule_id"
      case siteId = "site_id"
      case status = "status"
      case titles = "titles"
      case type = "type"
      case url = "url"
    }
  }
  internal struct CrawlPagesInsert: Codable, Hashable, Sendable {
    internal let etag: String?
    internal let failures: Int32?
    internal let fingerprint: String?
    internal let lastModified: String?
    internal let lastRead: String?
    internal let nextUrl: String?
    internal let readableShare: Decimal?
    internal let resultCount: Int32?
    internal let ruleId: UUID?
    internal let siteId: UUID
    internal let status: String?
    internal let titles: AnyJSON?
    internal let type: String
    internal let url: String
    internal enum CodingKeys: String, CodingKey {
      case etag = "etag"
      case failures = "failures"
      case fingerprint = "fingerprint"
      case lastModified = "last_modified"
      case lastRead = "last_read"
      case nextUrl = "next_url"
      case readableShare = "readable_share"
      case resultCount = "result_count"
      case ruleId = "rule_id"
      case siteId = "site_id"
      case status = "status"
      case titles = "titles"
      case type = "type"
      case url = "url"
    }
  }
  internal struct CrawlPagesUpdate: Codable, Hashable, Sendable {
    internal let etag: String?
    internal let failures: Int32?
    internal let fingerprint: String?
    internal let lastModified: String?
    internal let lastRead: String?
    internal let nextUrl: String?
    internal let readableShare: Decimal?
    internal let resultCount: Int32?
    internal let ruleId: UUID?
    internal let siteId: UUID?
    internal let status: String?
    internal let titles: AnyJSON?
    internal let type: String?
    internal let url: String?
    internal enum CodingKeys: String, CodingKey {
      case etag = "etag"
      case failures = "failures"
      case fingerprint = "fingerprint"
      case lastModified = "last_modified"
      case lastRead = "last_read"
      case nextUrl = "next_url"
      case readableShare = "readable_share"
      case resultCount = "result_count"
      case ruleId = "rule_id"
      case siteId = "site_id"
      case status = "status"
      case titles = "titles"
      case type = "type"
      case url = "url"
    }
  }
  internal struct CrawlPublicationQueueSelect: Codable, Hashable, Sendable {
    internal let extractionId: UUID
    internal let identityAvailableAt: String
    internal let identityError: String?
    internal let identityProcessedAt: String?
    internal let lastError: String?
    internal let processedAt: String?
    internal let queuedAt: String
    internal let runAvailableAt: String
    internal enum CodingKeys: String, CodingKey {
      case extractionId = "extraction_id"
      case identityAvailableAt = "identity_available_at"
      case identityError = "identity_error"
      case identityProcessedAt = "identity_processed_at"
      case lastError = "last_error"
      case processedAt = "processed_at"
      case queuedAt = "queued_at"
      case runAvailableAt = "run_available_at"
    }
  }
  internal struct CrawlPublicationQueueInsert: Codable, Hashable, Sendable {
    internal let extractionId: UUID
    internal let identityAvailableAt: String?
    internal let identityError: String?
    internal let identityProcessedAt: String?
    internal let lastError: String?
    internal let processedAt: String?
    internal let queuedAt: String?
    internal let runAvailableAt: String?
    internal enum CodingKeys: String, CodingKey {
      case extractionId = "extraction_id"
      case identityAvailableAt = "identity_available_at"
      case identityError = "identity_error"
      case identityProcessedAt = "identity_processed_at"
      case lastError = "last_error"
      case processedAt = "processed_at"
      case queuedAt = "queued_at"
      case runAvailableAt = "run_available_at"
    }
  }
  internal struct CrawlPublicationQueueUpdate: Codable, Hashable, Sendable {
    internal let extractionId: UUID?
    internal let identityAvailableAt: String?
    internal let identityError: String?
    internal let identityProcessedAt: String?
    internal let lastError: String?
    internal let processedAt: String?
    internal let queuedAt: String?
    internal let runAvailableAt: String?
    internal enum CodingKeys: String, CodingKey {
      case extractionId = "extraction_id"
      case identityAvailableAt = "identity_available_at"
      case identityError = "identity_error"
      case identityProcessedAt = "identity_processed_at"
      case lastError = "last_error"
      case processedAt = "processed_at"
      case queuedAt = "queued_at"
      case runAvailableAt = "run_available_at"
    }
  }
  internal struct CrawlRepairCyclesSelect: Codable, Hashable, Sendable {
    internal let attempts: Int32
    internal let contentVersion: String
    internal let lastAttemptAt: String
    internal let siteId: UUID
    internal enum CodingKeys: String, CodingKey {
      case attempts = "attempts"
      case contentVersion = "content_version"
      case lastAttemptAt = "last_attempt_at"
      case siteId = "site_id"
    }
  }
  internal struct CrawlRepairCyclesInsert: Codable, Hashable, Sendable {
    internal let attempts: Int32?
    internal let contentVersion: String
    internal let lastAttemptAt: String?
    internal let siteId: UUID
    internal enum CodingKeys: String, CodingKey {
      case attempts = "attempts"
      case contentVersion = "content_version"
      case lastAttemptAt = "last_attempt_at"
      case siteId = "site_id"
    }
  }
  internal struct CrawlRepairCyclesUpdate: Codable, Hashable, Sendable {
    internal let attempts: Int32?
    internal let contentVersion: String?
    internal let lastAttemptAt: String?
    internal let siteId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case attempts = "attempts"
      case contentVersion = "content_version"
      case lastAttemptAt = "last_attempt_at"
      case siteId = "site_id"
    }
  }
  internal struct CrawlRulesSelect: Codable, Hashable, Sendable {
    internal let author: String
    internal let createdAt: String
    internal let id: UUID
    internal let rules: AnyJSON
    internal let siteId: UUID
    internal let status: String
    internal let validation: AnyJSON?
    internal enum CodingKeys: String, CodingKey {
      case author = "author"
      case createdAt = "created_at"
      case id = "id"
      case rules = "rules"
      case siteId = "site_id"
      case status = "status"
      case validation = "validation"
    }
  }
  internal struct CrawlRulesInsert: Codable, Hashable, Sendable {
    internal let author: String
    internal let createdAt: String?
    internal let id: UUID?
    internal let rules: AnyJSON
    internal let siteId: UUID
    internal let status: String?
    internal let validation: AnyJSON?
    internal enum CodingKeys: String, CodingKey {
      case author = "author"
      case createdAt = "created_at"
      case id = "id"
      case rules = "rules"
      case siteId = "site_id"
      case status = "status"
      case validation = "validation"
    }
  }
  internal struct CrawlRulesUpdate: Codable, Hashable, Sendable {
    internal let author: String?
    internal let createdAt: String?
    internal let id: UUID?
    internal let rules: AnyJSON?
    internal let siteId: UUID?
    internal let status: String?
    internal let validation: AnyJSON?
    internal enum CodingKeys: String, CodingKey {
      case author = "author"
      case createdAt = "created_at"
      case id = "id"
      case rules = "rules"
      case siteId = "site_id"
      case status = "status"
      case validation = "validation"
    }
  }
  internal struct CrawlRunEvidenceSelect: Codable, Hashable, Sendable {
    internal let engagementId: UUID
    internal let evidenceField: String
    internal let evidenceText: String?
    internal let extractionId: UUID?
    internal let extractionMethod: String
    internal let factKey: String
    internal let id: UUID
    internal let kind: String
    internal let lastSeenAt: String
    internal let legacyRunId: UUID?
    internal let matchStatus: String
    internal let observedAt: String
    internal let onDate: String?
    internal let pageChecked: Bool
    internal let parserVersion: String
    internal let precision: String
    internal let rawTitle: String
    internal let segmentKey: String
    internal let sharedRef: String?
    internal let showId: UUID?
    internal let sourceEventKey: String
    internal let sourceId: UUID
    internal let sourceUrl: String
    internal let supersededAt: String?
    internal let valueHash: String
    internal let venueId: UUID?
    internal let withdrawnAt: String?
    internal enum CodingKeys: String, CodingKey {
      case engagementId = "engagement_id"
      case evidenceField = "evidence_field"
      case evidenceText = "evidence_text"
      case extractionId = "extraction_id"
      case extractionMethod = "extraction_method"
      case factKey = "fact_key"
      case id = "id"
      case kind = "kind"
      case lastSeenAt = "last_seen_at"
      case legacyRunId = "legacy_run_id"
      case matchStatus = "match_status"
      case observedAt = "observed_at"
      case onDate = "on_date"
      case pageChecked = "page_checked"
      case parserVersion = "parser_version"
      case precision = "precision"
      case rawTitle = "raw_title"
      case segmentKey = "segment_key"
      case sharedRef = "shared_ref"
      case showId = "show_id"
      case sourceEventKey = "source_event_key"
      case sourceId = "source_id"
      case sourceUrl = "source_url"
      case supersededAt = "superseded_at"
      case valueHash = "value_hash"
      case venueId = "venue_id"
      case withdrawnAt = "withdrawn_at"
    }
  }
  internal struct CrawlRunEvidenceInsert: Codable, Hashable, Sendable {
    internal let engagementId: UUID
    internal let evidenceField: String
    internal let evidenceText: String?
    internal let extractionId: UUID?
    internal let extractionMethod: String
    internal let factKey: String
    internal let id: UUID?
    internal let kind: String
    internal let lastSeenAt: String
    internal let legacyRunId: UUID?
    internal let matchStatus: String
    internal let observedAt: String
    internal let onDate: String?
    internal let pageChecked: Bool
    internal let parserVersion: String
    internal let precision: String
    internal let rawTitle: String
    internal let segmentKey: String
    internal let sharedRef: String?
    internal let showId: UUID?
    internal let sourceEventKey: String
    internal let sourceId: UUID
    internal let sourceUrl: String
    internal let supersededAt: String?
    internal let valueHash: String
    internal let venueId: UUID?
    internal let withdrawnAt: String?
    internal enum CodingKeys: String, CodingKey {
      case engagementId = "engagement_id"
      case evidenceField = "evidence_field"
      case evidenceText = "evidence_text"
      case extractionId = "extraction_id"
      case extractionMethod = "extraction_method"
      case factKey = "fact_key"
      case id = "id"
      case kind = "kind"
      case lastSeenAt = "last_seen_at"
      case legacyRunId = "legacy_run_id"
      case matchStatus = "match_status"
      case observedAt = "observed_at"
      case onDate = "on_date"
      case pageChecked = "page_checked"
      case parserVersion = "parser_version"
      case precision = "precision"
      case rawTitle = "raw_title"
      case segmentKey = "segment_key"
      case sharedRef = "shared_ref"
      case showId = "show_id"
      case sourceEventKey = "source_event_key"
      case sourceId = "source_id"
      case sourceUrl = "source_url"
      case supersededAt = "superseded_at"
      case valueHash = "value_hash"
      case venueId = "venue_id"
      case withdrawnAt = "withdrawn_at"
    }
  }
  internal struct CrawlRunEvidenceUpdate: Codable, Hashable, Sendable {
    internal let engagementId: UUID?
    internal let evidenceField: String?
    internal let evidenceText: String?
    internal let extractionId: UUID?
    internal let extractionMethod: String?
    internal let factKey: String?
    internal let id: UUID?
    internal let kind: String?
    internal let lastSeenAt: String?
    internal let legacyRunId: UUID?
    internal let matchStatus: String?
    internal let observedAt: String?
    internal let onDate: String?
    internal let pageChecked: Bool?
    internal let parserVersion: String?
    internal let precision: String?
    internal let rawTitle: String?
    internal let segmentKey: String?
    internal let sharedRef: String?
    internal let showId: UUID?
    internal let sourceEventKey: String?
    internal let sourceId: UUID?
    internal let sourceUrl: String?
    internal let supersededAt: String?
    internal let valueHash: String?
    internal let venueId: UUID?
    internal let withdrawnAt: String?
    internal enum CodingKeys: String, CodingKey {
      case engagementId = "engagement_id"
      case evidenceField = "evidence_field"
      case evidenceText = "evidence_text"
      case extractionId = "extraction_id"
      case extractionMethod = "extraction_method"
      case factKey = "fact_key"
      case id = "id"
      case kind = "kind"
      case lastSeenAt = "last_seen_at"
      case legacyRunId = "legacy_run_id"
      case matchStatus = "match_status"
      case observedAt = "observed_at"
      case onDate = "on_date"
      case pageChecked = "page_checked"
      case parserVersion = "parser_version"
      case precision = "precision"
      case rawTitle = "raw_title"
      case segmentKey = "segment_key"
      case sharedRef = "shared_ref"
      case showId = "show_id"
      case sourceEventKey = "source_event_key"
      case sourceId = "source_id"
      case sourceUrl = "source_url"
      case supersededAt = "superseded_at"
      case valueHash = "value_hash"
      case venueId = "venue_id"
      case withdrawnAt = "withdrawn_at"
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
    internal let pipeline: String
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
      case pipeline = "pipeline"
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
    internal let pipeline: String?
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
      case pipeline = "pipeline"
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
    internal let pipeline: String?
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
      case pipeline = "pipeline"
      case prompt = "prompt"
      case startedAt = "started_at"
      case status = "status"
      case summary = "summary"
      case venueIds = "venue_ids"
    }
  }
  internal struct CrawlShowTypeSuggestionsSelect: Codable, Hashable, Sendable {
    internal let confidence: Decimal
    internal let createdAt: String
    internal let firstDate: String?
    internal let id: UUID
    internal let lastDate: String?
    internal let promptVersion: Int32
    internal let provenance: String
    internal let revertedAt: String?
    internal let sourceKey: String
    internal let suggestedType: ShowType?
    internal let title: String
    internal let titleKey: String
    internal let usage: AnyJSON
    internal let venueId: UUID
    internal let venueName: String
    internal let verdict: String
    internal enum CodingKeys: String, CodingKey {
      case confidence = "confidence"
      case createdAt = "created_at"
      case firstDate = "first_date"
      case id = "id"
      case lastDate = "last_date"
      case promptVersion = "prompt_version"
      case provenance = "provenance"
      case revertedAt = "reverted_at"
      case sourceKey = "source_key"
      case suggestedType = "suggested_type"
      case title = "title"
      case titleKey = "title_key"
      case usage = "usage"
      case venueId = "venue_id"
      case venueName = "venue_name"
      case verdict = "verdict"
    }
  }
  internal struct CrawlShowTypeSuggestionsInsert: Codable, Hashable, Sendable {
    internal let confidence: Decimal
    internal let createdAt: String?
    internal let firstDate: String?
    internal let id: UUID?
    internal let lastDate: String?
    internal let promptVersion: Int32
    internal let provenance: String
    internal let revertedAt: String?
    internal let sourceKey: String
    internal let suggestedType: ShowType?
    internal let title: String
    internal let titleKey: String
    internal let usage: AnyJSON?
    internal let venueId: UUID
    internal let venueName: String
    internal let verdict: String
    internal enum CodingKeys: String, CodingKey {
      case confidence = "confidence"
      case createdAt = "created_at"
      case firstDate = "first_date"
      case id = "id"
      case lastDate = "last_date"
      case promptVersion = "prompt_version"
      case provenance = "provenance"
      case revertedAt = "reverted_at"
      case sourceKey = "source_key"
      case suggestedType = "suggested_type"
      case title = "title"
      case titleKey = "title_key"
      case usage = "usage"
      case venueId = "venue_id"
      case venueName = "venue_name"
      case verdict = "verdict"
    }
  }
  internal struct CrawlShowTypeSuggestionsUpdate: Codable, Hashable, Sendable {
    internal let confidence: Decimal?
    internal let createdAt: String?
    internal let firstDate: String?
    internal let id: UUID?
    internal let lastDate: String?
    internal let promptVersion: Int32?
    internal let provenance: String?
    internal let revertedAt: String?
    internal let sourceKey: String?
    internal let suggestedType: ShowType?
    internal let title: String?
    internal let titleKey: String?
    internal let usage: AnyJSON?
    internal let venueId: UUID?
    internal let venueName: String?
    internal let verdict: String?
    internal enum CodingKeys: String, CodingKey {
      case confidence = "confidence"
      case createdAt = "created_at"
      case firstDate = "first_date"
      case id = "id"
      case lastDate = "last_date"
      case promptVersion = "prompt_version"
      case provenance = "provenance"
      case revertedAt = "reverted_at"
      case sourceKey = "source_key"
      case suggestedType = "suggested_type"
      case title = "title"
      case titleKey = "title_key"
      case usage = "usage"
      case venueId = "venue_id"
      case venueName = "venue_name"
      case verdict = "verdict"
    }
  }
  internal struct CrawlSiteLeasesSelect: Codable, Hashable, Sendable {
    internal let expiresAt: String
    internal let owner: UUID
    internal let runId: UUID
    internal let siteId: UUID
    internal enum CodingKeys: String, CodingKey {
      case expiresAt = "expires_at"
      case owner = "owner"
      case runId = "run_id"
      case siteId = "site_id"
    }
  }
  internal struct CrawlSiteLeasesInsert: Codable, Hashable, Sendable {
    internal let expiresAt: String
    internal let owner: UUID
    internal let runId: UUID
    internal let siteId: UUID
    internal enum CodingKeys: String, CodingKey {
      case expiresAt = "expires_at"
      case owner = "owner"
      case runId = "run_id"
      case siteId = "site_id"
    }
  }
  internal struct CrawlSiteLeasesUpdate: Codable, Hashable, Sendable {
    internal let expiresAt: String?
    internal let owner: UUID?
    internal let runId: UUID?
    internal let siteId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case expiresAt = "expires_at"
      case owner = "owner"
      case runId = "run_id"
      case siteId = "site_id"
    }
  }
  internal struct CrawlSitesSelect: Codable, Hashable, Sendable {
    internal let archiveSource: String?
    internal let archiveStatus: String
    internal let archiveUrl: String?
    internal let health: AnyJSON
    internal let id: UUID
    internal let lastCrawledAt: String?
    internal let linkSource: String?
    internal let reason: String?
    internal let repairAttempts: Int32
    internal let status: String
    internal let updatedAt: String
    internal let websiteUrl: String?
    internal let whatsOnUrl: String
    internal enum CodingKeys: String, CodingKey {
      case archiveSource = "archive_source"
      case archiveStatus = "archive_status"
      case archiveUrl = "archive_url"
      case health = "health"
      case id = "id"
      case lastCrawledAt = "last_crawled_at"
      case linkSource = "link_source"
      case reason = "reason"
      case repairAttempts = "repair_attempts"
      case status = "status"
      case updatedAt = "updated_at"
      case websiteUrl = "website_url"
      case whatsOnUrl = "whats_on_url"
    }
  }
  internal struct CrawlSitesInsert: Codable, Hashable, Sendable {
    internal let archiveSource: String?
    internal let archiveStatus: String?
    internal let archiveUrl: String?
    internal let health: AnyJSON?
    internal let id: UUID?
    internal let lastCrawledAt: String?
    internal let linkSource: String?
    internal let reason: String?
    internal let repairAttempts: Int32?
    internal let status: String?
    internal let updatedAt: String?
    internal let websiteUrl: String?
    internal let whatsOnUrl: String
    internal enum CodingKeys: String, CodingKey {
      case archiveSource = "archive_source"
      case archiveStatus = "archive_status"
      case archiveUrl = "archive_url"
      case health = "health"
      case id = "id"
      case lastCrawledAt = "last_crawled_at"
      case linkSource = "link_source"
      case reason = "reason"
      case repairAttempts = "repair_attempts"
      case status = "status"
      case updatedAt = "updated_at"
      case websiteUrl = "website_url"
      case whatsOnUrl = "whats_on_url"
    }
  }
  internal struct CrawlSitesUpdate: Codable, Hashable, Sendable {
    internal let archiveSource: String?
    internal let archiveStatus: String?
    internal let archiveUrl: String?
    internal let health: AnyJSON?
    internal let id: UUID?
    internal let lastCrawledAt: String?
    internal let linkSource: String?
    internal let reason: String?
    internal let repairAttempts: Int32?
    internal let status: String?
    internal let updatedAt: String?
    internal let websiteUrl: String?
    internal let whatsOnUrl: String?
    internal enum CodingKeys: String, CodingKey {
      case archiveSource = "archive_source"
      case archiveStatus = "archive_status"
      case archiveUrl = "archive_url"
      case health = "health"
      case id = "id"
      case lastCrawledAt = "last_crawled_at"
      case linkSource = "link_source"
      case reason = "reason"
      case repairAttempts = "repair_attempts"
      case status = "status"
      case updatedAt = "updated_at"
      case websiteUrl = "website_url"
      case whatsOnUrl = "whats_on_url"
    }
  }
  internal struct CrawlSourceEntitiesSelect: Codable, Hashable, Sendable {
    internal let candidateId: UUID?
    internal let entityKind: String
    internal let evidence: AnyJSON
    internal let externalKey: String
    internal let firstSeenAt: String
    internal let lastExtractionId: UUID?
    internal let overrideLocked: Bool
    internal let resolutionReason: String?
    internal let resolutionStatus: String
    internal let reviewReason: String?
    internal let showId: UUID?
    internal let sourceId: UUID
    internal let venueId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case candidateId = "candidate_id"
      case entityKind = "entity_kind"
      case evidence = "evidence"
      case externalKey = "external_key"
      case firstSeenAt = "first_seen_at"
      case lastExtractionId = "last_extraction_id"
      case overrideLocked = "override_locked"
      case resolutionReason = "resolution_reason"
      case resolutionStatus = "resolution_status"
      case reviewReason = "review_reason"
      case showId = "show_id"
      case sourceId = "source_id"
      case venueId = "venue_id"
    }
  }
  internal struct CrawlSourceEntitiesInsert: Codable, Hashable, Sendable {
    internal let candidateId: UUID?
    internal let entityKind: String
    internal let evidence: AnyJSON?
    internal let externalKey: String
    internal let firstSeenAt: String?
    internal let lastExtractionId: UUID?
    internal let overrideLocked: Bool?
    internal let resolutionReason: String?
    internal let resolutionStatus: String?
    internal let reviewReason: String?
    internal let showId: UUID?
    internal let sourceId: UUID
    internal let venueId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case candidateId = "candidate_id"
      case entityKind = "entity_kind"
      case evidence = "evidence"
      case externalKey = "external_key"
      case firstSeenAt = "first_seen_at"
      case lastExtractionId = "last_extraction_id"
      case overrideLocked = "override_locked"
      case resolutionReason = "resolution_reason"
      case resolutionStatus = "resolution_status"
      case reviewReason = "review_reason"
      case showId = "show_id"
      case sourceId = "source_id"
      case venueId = "venue_id"
    }
  }
  internal struct CrawlSourceEntitiesUpdate: Codable, Hashable, Sendable {
    internal let candidateId: UUID?
    internal let entityKind: String?
    internal let evidence: AnyJSON?
    internal let externalKey: String?
    internal let firstSeenAt: String?
    internal let lastExtractionId: UUID?
    internal let overrideLocked: Bool?
    internal let resolutionReason: String?
    internal let resolutionStatus: String?
    internal let reviewReason: String?
    internal let showId: UUID?
    internal let sourceId: UUID?
    internal let venueId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case candidateId = "candidate_id"
      case entityKind = "entity_kind"
      case evidence = "evidence"
      case externalKey = "external_key"
      case firstSeenAt = "first_seen_at"
      case lastExtractionId = "last_extraction_id"
      case overrideLocked = "override_locked"
      case resolutionReason = "resolution_reason"
      case resolutionStatus = "resolution_status"
      case reviewReason = "review_reason"
      case showId = "show_id"
      case sourceId = "source_id"
      case venueId = "venue_id"
    }
  }
  internal struct CrawlSourcesSelect: Codable, Hashable, Sendable {
    internal let adapterVersion: String
    internal let allowedHosts: [String]
    internal let claimSequence: Int64
    internal let collectionEnabled: Bool
    internal let id: UUID
    internal let minIntervalMs: Int32
    internal let operatorPausedAt: String?
    internal let pausedReason: String?
    internal let publicationEnabled: Bool
    internal let sourceKey: String
    internal let withdrawnAt: String?
    internal enum CodingKeys: String, CodingKey {
      case adapterVersion = "adapter_version"
      case allowedHosts = "allowed_hosts"
      case claimSequence = "claim_sequence"
      case collectionEnabled = "collection_enabled"
      case id = "id"
      case minIntervalMs = "min_interval_ms"
      case operatorPausedAt = "operator_paused_at"
      case pausedReason = "paused_reason"
      case publicationEnabled = "publication_enabled"
      case sourceKey = "source_key"
      case withdrawnAt = "withdrawn_at"
    }
  }
  internal struct CrawlSourcesInsert: Codable, Hashable, Sendable {
    internal let adapterVersion: String
    internal let allowedHosts: [String]?
    internal let claimSequence: Int64?
    internal let collectionEnabled: Bool?
    internal let id: UUID?
    internal let minIntervalMs: Int32?
    internal let operatorPausedAt: String?
    internal let pausedReason: String?
    internal let publicationEnabled: Bool?
    internal let sourceKey: String
    internal let withdrawnAt: String?
    internal enum CodingKeys: String, CodingKey {
      case adapterVersion = "adapter_version"
      case allowedHosts = "allowed_hosts"
      case claimSequence = "claim_sequence"
      case collectionEnabled = "collection_enabled"
      case id = "id"
      case minIntervalMs = "min_interval_ms"
      case operatorPausedAt = "operator_paused_at"
      case pausedReason = "paused_reason"
      case publicationEnabled = "publication_enabled"
      case sourceKey = "source_key"
      case withdrawnAt = "withdrawn_at"
    }
  }
  internal struct CrawlSourcesUpdate: Codable, Hashable, Sendable {
    internal let adapterVersion: String?
    internal let allowedHosts: [String]?
    internal let claimSequence: Int64?
    internal let collectionEnabled: Bool?
    internal let id: UUID?
    internal let minIntervalMs: Int32?
    internal let operatorPausedAt: String?
    internal let pausedReason: String?
    internal let publicationEnabled: Bool?
    internal let sourceKey: String?
    internal let withdrawnAt: String?
    internal enum CodingKeys: String, CodingKey {
      case adapterVersion = "adapter_version"
      case allowedHosts = "allowed_hosts"
      case claimSequence = "claim_sequence"
      case collectionEnabled = "collection_enabled"
      case id = "id"
      case minIntervalMs = "min_interval_ms"
      case operatorPausedAt = "operator_paused_at"
      case pausedReason = "paused_reason"
      case publicationEnabled = "publication_enabled"
      case sourceKey = "source_key"
      case withdrawnAt = "withdrawn_at"
    }
  }
  internal struct CrawlTaskEdgesSelect: Codable, Hashable, Sendable {
    internal let childId: UUID
    internal let generationId: UUID
    internal let parentId: UUID
    internal enum CodingKeys: String, CodingKey {
      case childId = "child_id"
      case generationId = "generation_id"
      case parentId = "parent_id"
    }
  }
  internal struct CrawlTaskEdgesInsert: Codable, Hashable, Sendable {
    internal let childId: UUID
    internal let generationId: UUID
    internal let parentId: UUID
    internal enum CodingKeys: String, CodingKey {
      case childId = "child_id"
      case generationId = "generation_id"
      case parentId = "parent_id"
    }
  }
  internal struct CrawlTaskEdgesUpdate: Codable, Hashable, Sendable {
    internal let childId: UUID?
    internal let generationId: UUID?
    internal let parentId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case childId = "child_id"
      case generationId = "generation_id"
      case parentId = "parent_id"
    }
  }
  internal struct CrawlTasksSelect: Codable, Hashable, Sendable {
    internal let attempts: Int32
    internal let availableAt: String
    internal let canonicalUrl: String
    internal let consecutiveFailures: Int32
    internal let contentHash: String?
    internal let discoveredAt: String
    internal let etag: String?
    internal let generationId: UUID
    internal let httpRequests: Int64
    internal let id: UUID
    internal let lastAttemptAt: String?
    internal let lastError: String?
    internal let lastModified: String?
    internal let lastSuccessAt: String?
    internal let leaseExpiresAt: String?
    internal let leaseOwner: String?
    internal let leaseToken: UUID?
    internal let parserVersion: String?
    internal let priority: Int32
    internal let refreshAt: String?
    internal let sourceId: UUID
    internal let stage: String
    internal let status: String
    internal enum CodingKeys: String, CodingKey {
      case attempts = "attempts"
      case availableAt = "available_at"
      case canonicalUrl = "canonical_url"
      case consecutiveFailures = "consecutive_failures"
      case contentHash = "content_hash"
      case discoveredAt = "discovered_at"
      case etag = "etag"
      case generationId = "generation_id"
      case httpRequests = "http_requests"
      case id = "id"
      case lastAttemptAt = "last_attempt_at"
      case lastError = "last_error"
      case lastModified = "last_modified"
      case lastSuccessAt = "last_success_at"
      case leaseExpiresAt = "lease_expires_at"
      case leaseOwner = "lease_owner"
      case leaseToken = "lease_token"
      case parserVersion = "parser_version"
      case priority = "priority"
      case refreshAt = "refresh_at"
      case sourceId = "source_id"
      case stage = "stage"
      case status = "status"
    }
  }
  internal struct CrawlTasksInsert: Codable, Hashable, Sendable {
    internal let attempts: Int32?
    internal let availableAt: String?
    internal let canonicalUrl: String
    internal let consecutiveFailures: Int32?
    internal let contentHash: String?
    internal let discoveredAt: String?
    internal let etag: String?
    internal let generationId: UUID
    internal let httpRequests: Int64?
    internal let id: UUID?
    internal let lastAttemptAt: String?
    internal let lastError: String?
    internal let lastModified: String?
    internal let lastSuccessAt: String?
    internal let leaseExpiresAt: String?
    internal let leaseOwner: String?
    internal let leaseToken: UUID?
    internal let parserVersion: String?
    internal let priority: Int32?
    internal let refreshAt: String?
    internal let sourceId: UUID
    internal let stage: String
    internal let status: String?
    internal enum CodingKeys: String, CodingKey {
      case attempts = "attempts"
      case availableAt = "available_at"
      case canonicalUrl = "canonical_url"
      case consecutiveFailures = "consecutive_failures"
      case contentHash = "content_hash"
      case discoveredAt = "discovered_at"
      case etag = "etag"
      case generationId = "generation_id"
      case httpRequests = "http_requests"
      case id = "id"
      case lastAttemptAt = "last_attempt_at"
      case lastError = "last_error"
      case lastModified = "last_modified"
      case lastSuccessAt = "last_success_at"
      case leaseExpiresAt = "lease_expires_at"
      case leaseOwner = "lease_owner"
      case leaseToken = "lease_token"
      case parserVersion = "parser_version"
      case priority = "priority"
      case refreshAt = "refresh_at"
      case sourceId = "source_id"
      case stage = "stage"
      case status = "status"
    }
  }
  internal struct CrawlTasksUpdate: Codable, Hashable, Sendable {
    internal let attempts: Int32?
    internal let availableAt: String?
    internal let canonicalUrl: String?
    internal let consecutiveFailures: Int32?
    internal let contentHash: String?
    internal let discoveredAt: String?
    internal let etag: String?
    internal let generationId: UUID?
    internal let httpRequests: Int64?
    internal let id: UUID?
    internal let lastAttemptAt: String?
    internal let lastError: String?
    internal let lastModified: String?
    internal let lastSuccessAt: String?
    internal let leaseExpiresAt: String?
    internal let leaseOwner: String?
    internal let leaseToken: UUID?
    internal let parserVersion: String?
    internal let priority: Int32?
    internal let refreshAt: String?
    internal let sourceId: UUID?
    internal let stage: String?
    internal let status: String?
    internal enum CodingKeys: String, CodingKey {
      case attempts = "attempts"
      case availableAt = "available_at"
      case canonicalUrl = "canonical_url"
      case consecutiveFailures = "consecutive_failures"
      case contentHash = "content_hash"
      case discoveredAt = "discovered_at"
      case etag = "etag"
      case generationId = "generation_id"
      case httpRequests = "http_requests"
      case id = "id"
      case lastAttemptAt = "last_attempt_at"
      case lastError = "last_error"
      case lastModified = "last_modified"
      case lastSuccessAt = "last_success_at"
      case leaseExpiresAt = "lease_expires_at"
      case leaseOwner = "lease_owner"
      case leaseToken = "lease_token"
      case parserVersion = "parser_version"
      case priority = "priority"
      case refreshAt = "refresh_at"
      case sourceId = "source_id"
      case stage = "stage"
      case status = "status"
    }
  }
  internal struct CrawlWorkerRunsSelect: Codable, Hashable, Sendable {
    internal let finishedAt: String?
    internal let githubRunId: String?
    internal let id: UUID
    internal let limits: AnyJSON
    internal let logUrl: String?
    internal let modelSpendUsd: Decimal
    internal let perSource: AnyJSON
    internal let scopeFilter: String?
    internal let sourceFilter: String?
    internal let stageFilter: String?
    internal let startedAt: String
    internal let startedVia: String?
    internal let stopReason: String?
    internal let trigger: String
    internal enum CodingKeys: String, CodingKey {
      case finishedAt = "finished_at"
      case githubRunId = "github_run_id"
      case id = "id"
      case limits = "limits"
      case logUrl = "log_url"
      case modelSpendUsd = "model_spend_usd"
      case perSource = "per_source"
      case scopeFilter = "scope_filter"
      case sourceFilter = "source_filter"
      case stageFilter = "stage_filter"
      case startedAt = "started_at"
      case startedVia = "started_via"
      case stopReason = "stop_reason"
      case trigger = "trigger"
    }
  }
  internal struct CrawlWorkerRunsInsert: Codable, Hashable, Sendable {
    internal let finishedAt: String?
    internal let githubRunId: String?
    internal let id: UUID?
    internal let limits: AnyJSON?
    internal let logUrl: String?
    internal let modelSpendUsd: Decimal?
    internal let perSource: AnyJSON?
    internal let scopeFilter: String?
    internal let sourceFilter: String?
    internal let stageFilter: String?
    internal let startedAt: String?
    internal let startedVia: String?
    internal let stopReason: String?
    internal let trigger: String
    internal enum CodingKeys: String, CodingKey {
      case finishedAt = "finished_at"
      case githubRunId = "github_run_id"
      case id = "id"
      case limits = "limits"
      case logUrl = "log_url"
      case modelSpendUsd = "model_spend_usd"
      case perSource = "per_source"
      case scopeFilter = "scope_filter"
      case sourceFilter = "source_filter"
      case stageFilter = "stage_filter"
      case startedAt = "started_at"
      case startedVia = "started_via"
      case stopReason = "stop_reason"
      case trigger = "trigger"
    }
  }
  internal struct CrawlWorkerRunsUpdate: Codable, Hashable, Sendable {
    internal let finishedAt: String?
    internal let githubRunId: String?
    internal let id: UUID?
    internal let limits: AnyJSON?
    internal let logUrl: String?
    internal let modelSpendUsd: Decimal?
    internal let perSource: AnyJSON?
    internal let scopeFilter: String?
    internal let sourceFilter: String?
    internal let stageFilter: String?
    internal let startedAt: String?
    internal let startedVia: String?
    internal let stopReason: String?
    internal let trigger: String?
    internal enum CodingKeys: String, CodingKey {
      case finishedAt = "finished_at"
      case githubRunId = "github_run_id"
      case id = "id"
      case limits = "limits"
      case logUrl = "log_url"
      case modelSpendUsd = "model_spend_usd"
      case perSource = "per_source"
      case scopeFilter = "scope_filter"
      case sourceFilter = "source_filter"
      case stageFilter = "stage_filter"
      case startedAt = "started_at"
      case startedVia = "started_via"
      case stopReason = "stop_reason"
      case trigger = "trigger"
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
  internal struct FeatureAccessSelect: Codable, Hashable, Sendable {
    internal let feature: String
    internal let tier: String
    internal enum CodingKeys: String, CodingKey {
      case feature = "feature"
      case tier = "tier"
    }
  }
  internal struct FeatureAccessInsert: Codable, Hashable, Sendable {
    internal let feature: String
    internal let tier: String
    internal enum CodingKeys: String, CodingKey {
      case feature = "feature"
      case tier = "tier"
    }
  }
  internal struct FeatureAccessUpdate: Codable, Hashable, Sendable {
    internal let feature: String?
    internal let tier: String?
    internal enum CodingKeys: String, CodingKey {
      case feature = "feature"
      case tier = "tier"
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
  internal struct MembershipGrantsSelect: Codable, Hashable, Sendable {
    internal let endsAt: String
    internal let grantedBy: UUID?
    internal let id: UUID
    internal let reason: String
    internal let startsAt: String
    internal let userId: UUID
    internal enum CodingKeys: String, CodingKey {
      case endsAt = "ends_at"
      case grantedBy = "granted_by"
      case id = "id"
      case reason = "reason"
      case startsAt = "starts_at"
      case userId = "user_id"
    }
  }
  internal struct MembershipGrantsInsert: Codable, Hashable, Sendable {
    internal let endsAt: String
    internal let grantedBy: UUID?
    internal let id: UUID?
    internal let reason: String
    internal let startsAt: String?
    internal let userId: UUID
    internal enum CodingKeys: String, CodingKey {
      case endsAt = "ends_at"
      case grantedBy = "granted_by"
      case id = "id"
      case reason = "reason"
      case startsAt = "starts_at"
      case userId = "user_id"
    }
  }
  internal struct MembershipGrantsUpdate: Codable, Hashable, Sendable {
    internal let endsAt: String?
    internal let grantedBy: UUID?
    internal let id: UUID?
    internal let reason: String?
    internal let startsAt: String?
    internal let userId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case endsAt = "ends_at"
      case grantedBy = "granted_by"
      case id = "id"
      case reason = "reason"
      case startsAt = "starts_at"
      case userId = "user_id"
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
  internal struct RunsSelect: Codable, Hashable, Sendable {
    internal let confidence: Decimal
    internal let endDate: String?
    internal let id: UUID
    internal let lastSeenAt: String
    internal let showId: UUID?
    internal let source: String
    internal let sourceUrl: String
    internal let startDate: String
    internal let title: String
    internal let titleKey: String?
    internal let venueId: UUID
    internal enum CodingKeys: String, CodingKey {
      case confidence = "confidence"
      case endDate = "end_date"
      case id = "id"
      case lastSeenAt = "last_seen_at"
      case showId = "show_id"
      case source = "source"
      case sourceUrl = "source_url"
      case startDate = "start_date"
      case title = "title"
      case titleKey = "title_key"
      case venueId = "venue_id"
    }
  }
  internal struct RunsInsert: Codable, Hashable, Sendable {
    internal let confidence: Decimal
    internal let endDate: String?
    internal let id: UUID?
    internal let lastSeenAt: String?
    internal let showId: UUID?
    internal let source: String
    internal let sourceUrl: String
    internal let startDate: String
    internal let title: String
    internal let titleKey: String?
    internal let venueId: UUID
    internal enum CodingKeys: String, CodingKey {
      case confidence = "confidence"
      case endDate = "end_date"
      case id = "id"
      case lastSeenAt = "last_seen_at"
      case showId = "show_id"
      case source = "source"
      case sourceUrl = "source_url"
      case startDate = "start_date"
      case title = "title"
      case titleKey = "title_key"
      case venueId = "venue_id"
    }
  }
  internal struct RunsUpdate: Codable, Hashable, Sendable {
    internal let confidence: Decimal?
    internal let endDate: String?
    internal let id: UUID?
    internal let lastSeenAt: String?
    internal let showId: UUID?
    internal let source: String?
    internal let sourceUrl: String?
    internal let startDate: String?
    internal let title: String?
    internal let titleKey: String?
    internal let venueId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case confidence = "confidence"
      case endDate = "end_date"
      case id = "id"
      case lastSeenAt = "last_seen_at"
      case showId = "show_id"
      case source = "source"
      case sourceUrl = "source_url"
      case startDate = "start_date"
      case title = "title"
      case titleKey = "title_key"
      case venueId = "venue_id"
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
  internal struct ShowCandidatesSelect: Codable, Hashable, Sendable {
    internal let aliases: [String]
    internal let createdAt: String
    internal let firstPerformed: Int16?
    internal let id: UUID
    internal let reviewMethod: String?
    internal let reviewedAt: String?
    internal let sampleId: UUID?
    internal let seenCount: Int32
    internal let showId: UUID?
    internal let source: String
    internal let sourceRef: String
    internal let sourceUrl: String?
    internal let status: String
    internal let title: String
    internal let type: ShowType
    internal let typeSuggestionId: UUID?
    internal let updatedAt: String
    internal let venueId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case aliases = "aliases"
      case createdAt = "created_at"
      case firstPerformed = "first_performed"
      case id = "id"
      case reviewMethod = "review_method"
      case reviewedAt = "reviewed_at"
      case sampleId = "sample_id"
      case seenCount = "seen_count"
      case showId = "show_id"
      case source = "source"
      case sourceRef = "source_ref"
      case sourceUrl = "source_url"
      case status = "status"
      case title = "title"
      case type = "type"
      case typeSuggestionId = "type_suggestion_id"
      case updatedAt = "updated_at"
      case venueId = "venue_id"
    }
  }
  internal struct ShowCandidatesInsert: Codable, Hashable, Sendable {
    internal let aliases: [String]?
    internal let createdAt: String?
    internal let firstPerformed: Int16?
    internal let id: UUID?
    internal let reviewMethod: String?
    internal let reviewedAt: String?
    internal let sampleId: UUID?
    internal let seenCount: Int32?
    internal let showId: UUID?
    internal let source: String?
    internal let sourceRef: String
    internal let sourceUrl: String?
    internal let status: String?
    internal let title: String
    internal let type: ShowType?
    internal let typeSuggestionId: UUID?
    internal let updatedAt: String?
    internal let venueId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case aliases = "aliases"
      case createdAt = "created_at"
      case firstPerformed = "first_performed"
      case id = "id"
      case reviewMethod = "review_method"
      case reviewedAt = "reviewed_at"
      case sampleId = "sample_id"
      case seenCount = "seen_count"
      case showId = "show_id"
      case source = "source"
      case sourceRef = "source_ref"
      case sourceUrl = "source_url"
      case status = "status"
      case title = "title"
      case type = "type"
      case typeSuggestionId = "type_suggestion_id"
      case updatedAt = "updated_at"
      case venueId = "venue_id"
    }
  }
  internal struct ShowCandidatesUpdate: Codable, Hashable, Sendable {
    internal let aliases: [String]?
    internal let createdAt: String?
    internal let firstPerformed: Int16?
    internal let id: UUID?
    internal let reviewMethod: String?
    internal let reviewedAt: String?
    internal let sampleId: UUID?
    internal let seenCount: Int32?
    internal let showId: UUID?
    internal let source: String?
    internal let sourceRef: String?
    internal let sourceUrl: String?
    internal let status: String?
    internal let title: String?
    internal let type: ShowType?
    internal let typeSuggestionId: UUID?
    internal let updatedAt: String?
    internal let venueId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case aliases = "aliases"
      case createdAt = "created_at"
      case firstPerformed = "first_performed"
      case id = "id"
      case reviewMethod = "review_method"
      case reviewedAt = "reviewed_at"
      case sampleId = "sample_id"
      case seenCount = "seen_count"
      case showId = "show_id"
      case source = "source"
      case sourceRef = "source_ref"
      case sourceUrl = "source_url"
      case status = "status"
      case title = "title"
      case type = "type"
      case typeSuggestionId = "type_suggestion_id"
      case updatedAt = "updated_at"
      case venueId = "venue_id"
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
  internal struct SubscriptionsSelect: Codable, Hashable, Sendable {
    internal let environment: String
    internal let id: UUID
    internal let lastEventId: String?
    internal let periodEnd: String
    internal let productId: String
    internal let provider: String
    internal let status: String
    internal let storeTransactionId: String
    internal let updatedAt: String
    internal let userId: UUID
    internal let willRenew: Bool
    internal enum CodingKeys: String, CodingKey {
      case environment = "environment"
      case id = "id"
      case lastEventId = "last_event_id"
      case periodEnd = "period_end"
      case productId = "product_id"
      case provider = "provider"
      case status = "status"
      case storeTransactionId = "store_transaction_id"
      case updatedAt = "updated_at"
      case userId = "user_id"
      case willRenew = "will_renew"
    }
  }
  internal struct SubscriptionsInsert: Codable, Hashable, Sendable {
    internal let environment: String
    internal let id: UUID?
    internal let lastEventId: String?
    internal let periodEnd: String
    internal let productId: String
    internal let provider: String
    internal let status: String
    internal let storeTransactionId: String
    internal let updatedAt: String?
    internal let userId: UUID
    internal let willRenew: Bool?
    internal enum CodingKeys: String, CodingKey {
      case environment = "environment"
      case id = "id"
      case lastEventId = "last_event_id"
      case periodEnd = "period_end"
      case productId = "product_id"
      case provider = "provider"
      case status = "status"
      case storeTransactionId = "store_transaction_id"
      case updatedAt = "updated_at"
      case userId = "user_id"
      case willRenew = "will_renew"
    }
  }
  internal struct SubscriptionsUpdate: Codable, Hashable, Sendable {
    internal let environment: String?
    internal let id: UUID?
    internal let lastEventId: String?
    internal let periodEnd: String?
    internal let productId: String?
    internal let provider: String?
    internal let status: String?
    internal let storeTransactionId: String?
    internal let updatedAt: String?
    internal let userId: UUID?
    internal let willRenew: Bool?
    internal enum CodingKeys: String, CodingKey {
      case environment = "environment"
      case id = "id"
      case lastEventId = "last_event_id"
      case periodEnd = "period_end"
      case productId = "product_id"
      case provider = "provider"
      case status = "status"
      case storeTransactionId = "store_transaction_id"
      case updatedAt = "updated_at"
      case userId = "user_id"
      case willRenew = "will_renew"
    }
  }
  internal struct VenueAliasesSelect: Codable, Hashable, Sendable {
    internal let alias: String
    internal let createdAt: String
    internal let createdBy: UUID?
    internal let id: UUID
    internal let kind: String
    internal let searchText: String?
    internal let source: String
    internal let validFrom: String?
    internal let validTo: String?
    internal let venueId: UUID
    internal enum CodingKeys: String, CodingKey {
      case alias = "alias"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case id = "id"
      case kind = "kind"
      case searchText = "search_text"
      case source = "source"
      case validFrom = "valid_from"
      case validTo = "valid_to"
      case venueId = "venue_id"
    }
  }
  internal struct VenueAliasesInsert: Codable, Hashable, Sendable {
    internal let alias: String
    internal let createdAt: String?
    internal let createdBy: UUID?
    internal let id: UUID?
    internal let kind: String
    internal let searchText: String?
    internal let source: String
    internal let validFrom: String?
    internal let validTo: String?
    internal let venueId: UUID
    internal enum CodingKeys: String, CodingKey {
      case alias = "alias"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case id = "id"
      case kind = "kind"
      case searchText = "search_text"
      case source = "source"
      case validFrom = "valid_from"
      case validTo = "valid_to"
      case venueId = "venue_id"
    }
  }
  internal struct VenueAliasesUpdate: Codable, Hashable, Sendable {
    internal let alias: String?
    internal let createdAt: String?
    internal let createdBy: UUID?
    internal let id: UUID?
    internal let kind: String?
    internal let searchText: String?
    internal let source: String?
    internal let validFrom: String?
    internal let validTo: String?
    internal let venueId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case alias = "alias"
      case createdAt = "created_at"
      case createdBy = "created_by"
      case id = "id"
      case kind = "kind"
      case searchText = "search_text"
      case source = "source"
      case validFrom = "valid_from"
      case validTo = "valid_to"
      case venueId = "venue_id"
    }
  }
  internal struct VenuesSelect: Codable, Hashable, Sendable {
    internal let catalogueAuditorium: String?
    internal let catalogueGranularity: String?
    internal let cataloguePostcode: String?
    internal let catalogueStreet: String?
    internal let circuit: VenueCircuit?
    internal let city: String?
    internal let country: String?
    internal let crawlAttemptAt: String?
    internal let crawlAttempts: Int32
    internal let crawlError: String?
    internal let crawlSiteId: UUID?
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
    internal let websiteSource: String?
    internal let whatsOnSource: String?
    internal let whatsOnUrl: String?
    internal let wikidataId: String?
    internal enum CodingKeys: String, CodingKey {
      case catalogueAuditorium = "catalogue_auditorium"
      case catalogueGranularity = "catalogue_granularity"
      case cataloguePostcode = "catalogue_postcode"
      case catalogueStreet = "catalogue_street"
      case circuit = "circuit"
      case city = "city"
      case country = "country"
      case crawlAttemptAt = "crawl_attempt_at"
      case crawlAttempts = "crawl_attempts"
      case crawlError = "crawl_error"
      case crawlSiteId = "crawl_site_id"
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
      case websiteSource = "website_source"
      case whatsOnSource = "whats_on_source"
      case whatsOnUrl = "whats_on_url"
      case wikidataId = "wikidata_id"
    }
  }
  internal struct VenuesInsert: Codable, Hashable, Sendable {
    internal let catalogueAuditorium: String?
    internal let catalogueGranularity: String?
    internal let cataloguePostcode: String?
    internal let catalogueStreet: String?
    internal let circuit: VenueCircuit?
    internal let city: String?
    internal let country: String?
    internal let crawlAttemptAt: String?
    internal let crawlAttempts: Int32?
    internal let crawlError: String?
    internal let crawlSiteId: UUID?
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
    internal let websiteSource: String?
    internal let whatsOnSource: String?
    internal let whatsOnUrl: String?
    internal let wikidataId: String?
    internal enum CodingKeys: String, CodingKey {
      case catalogueAuditorium = "catalogue_auditorium"
      case catalogueGranularity = "catalogue_granularity"
      case cataloguePostcode = "catalogue_postcode"
      case catalogueStreet = "catalogue_street"
      case circuit = "circuit"
      case city = "city"
      case country = "country"
      case crawlAttemptAt = "crawl_attempt_at"
      case crawlAttempts = "crawl_attempts"
      case crawlError = "crawl_error"
      case crawlSiteId = "crawl_site_id"
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
      case websiteSource = "website_source"
      case whatsOnSource = "whats_on_source"
      case whatsOnUrl = "whats_on_url"
      case wikidataId = "wikidata_id"
    }
  }
  internal struct VenuesUpdate: Codable, Hashable, Sendable {
    internal let catalogueAuditorium: String?
    internal let catalogueGranularity: String?
    internal let cataloguePostcode: String?
    internal let catalogueStreet: String?
    internal let circuit: VenueCircuit?
    internal let city: String?
    internal let country: String?
    internal let crawlAttemptAt: String?
    internal let crawlAttempts: Int32?
    internal let crawlError: String?
    internal let crawlSiteId: UUID?
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
    internal let websiteSource: String?
    internal let whatsOnSource: String?
    internal let whatsOnUrl: String?
    internal let wikidataId: String?
    internal enum CodingKeys: String, CodingKey {
      case catalogueAuditorium = "catalogue_auditorium"
      case catalogueGranularity = "catalogue_granularity"
      case cataloguePostcode = "catalogue_postcode"
      case catalogueStreet = "catalogue_street"
      case circuit = "circuit"
      case city = "city"
      case country = "country"
      case crawlAttemptAt = "crawl_attempt_at"
      case crawlAttempts = "crawl_attempts"
      case crawlError = "crawl_error"
      case crawlSiteId = "crawl_site_id"
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
      case websiteSource = "website_source"
      case whatsOnSource = "whats_on_source"
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
  internal struct CatalogueEffectiveRunsSelect: Codable, Hashable, Sendable {
    internal let autofillEligible: Bool?
    internal let autofillReason: String?
    internal let bookingUntil: String?
    internal let cancelled: Bool?
    internal let confirmedEndDate: String?
    internal let conflicting: Bool?
    internal let exceptionDates: [String]?
    internal let id: UUID?
    internal let lastObservedAt: String?
    internal let legacy: Bool?
    internal let openingDate: String?
    internal let performanceDates: [String]?
    internal let previewDate: String?
    internal let scheduledEndDate: String?
    internal let showId: UUID?
    internal let startDate: String?
    internal let supportEndDate: String?
    internal let title: String?
    internal let venueId: UUID?
    internal enum CodingKeys: String, CodingKey {
      case autofillEligible = "autofill_eligible"
      case autofillReason = "autofill_reason"
      case bookingUntil = "booking_until"
      case cancelled = "cancelled"
      case confirmedEndDate = "confirmed_end_date"
      case conflicting = "conflicting"
      case exceptionDates = "exception_dates"
      case id = "id"
      case lastObservedAt = "last_observed_at"
      case legacy = "legacy"
      case openingDate = "opening_date"
      case performanceDates = "performance_dates"
      case previewDate = "preview_date"
      case scheduledEndDate = "scheduled_end_date"
      case showId = "show_id"
      case startDate = "start_date"
      case supportEndDate = "support_end_date"
      case title = "title"
      case venueId = "venue_id"
    }
  }
}

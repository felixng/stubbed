import Foundation
import Supabase

/// Product events in the `events` table, with the same names and props as
/// the web (apps/web/src/lib/analytics.ts, docs/ANALYTICS.md). Small,
/// non-personal details only. Fire and forget: never blocks or breaks the
/// action it describes.
enum Analytics {
  enum Event: String {
    case entryLogged = "entry_logged"
    case cardShared = "card_shared"
    case paywallViewed = "paywall_viewed"
    case purchaseCompleted = "purchase_completed"
  }

  static func track(_ event: Event, _ props: [String: AnyJSON] = [:]) {
    Task.detached {
      struct Insert: Encodable {
        let name: String
        let props: [String: AnyJSON]
      }
      do {
        try await supabase.from("events").insert(Insert(name: event.rawValue, props: props)).execute()
      } catch {
        Log.data.warning("Recording \(event.rawValue, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
      }
    }
  }
}

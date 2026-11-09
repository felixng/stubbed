import SwiftUI

/// What sharing one of your shows needs: the caption, the public page (when
/// there is one) and the drawn cards. Shared by the entry screen and the
/// feed's share button, so both send the same thing.
enum EntryShare {
  struct Info {
    let text: String
    let link: URL?
  }

  struct Prepared {
    let info: Info
    /// nil when drawing failed.
    let cards: [RenderedCard]?
  }

  /// The public page for a show: getstubbed.app/e/<id>.
  static func link(_ entryId: UUID) -> URL {
    AppConfig.current.webURL.appendingPathComponent("e/\(entryId.uuidString.lowercased())")
  }

  /// Draws the cards on the device, like the web: the photo never leaves
  /// it, and the counts come from Postgres.
  @MainActor
  static func prepare(_ entry: Entry, photo: URL?) async -> Prepared {
    do {
      async let stats = ShareCards.stats(entry.id)
      async let owner = Profiles.profile(entry.userId)
      async let insights = Insights.load(year: InsightStats.currentYear)
      async let image = ShareCards.image(photo)
      let (s, profile, picture, aggregate) = try await (stats, owner, image, insights)
      let data = EntryCardData(
        title: entry.show.title, venue: entry.venue?.name, whereText: entry.whereText ?? "",
        date: Day.format(entry.date), day: entry.date, year: Int(entry.date.prefix(4)) ?? 0, rating: entry.rating,
        showOfYear: s.show_of_year, venueVisit: s.venue_visit, timesSeen: s.times_seen, handle: profile.handle)
      let caption = entry.venue.map { "\(entry.show.title) at \($0.name)" } ?? entry.show.title
      let isPublic = entry.visibility == .public && !profile.isPrivate
      let info = Info(text: "\(caption). Tracked on Stubbed \(stubbedInstagram)", link: isPublic ? link(entry.id) : nil)
      do {
        return Prepared(
          info: info, cards: try ShareCards.showCards(data, photo: picture,
            insights: InsightCardData(stats: aggregate, year: InsightStats.currentYear, handle: profile.handle)))
      } catch {
        Log.app.error("Drawing the share cards failed: \(error.localizedDescription, privacy: .public)")
        return Prepared(info: info, cards: nil)
      }
    } catch {
      Log.app.error("Loading the share card data failed: \(error.localizedDescription, privacy: .public)")
      return Prepared(info: Info(text: entry.show.title, link: nil), cards: nil)
    }
  }

  /// What the native share sheet sends for someone else's show: a line about
  /// it and its page, with no card (their card is theirs to post).
  static func others(_ entry: Entry, owner: Person) -> (text: String, link: URL) {
    let caption = entry.venue.map { "\(entry.show.title) at \($0.name)" } ?? entry.show.title
    return ("@\(owner.handle) saw \(caption) on Stubbed", link(entry.id))
  }
}

/// The Share screen for one of your shows, opened from a feed card: draws
/// the cards, then the same carousel as the entry screen.
struct EntryShareSheet: View {
  let entry: Entry
  let photo: URL?

  @Environment(Membership.self) private var membership
  @State private var prepared: EntryShare.Prepared?

  var body: some View {
    ShareScreen {
      ShareCarousel(
        subject: .show, cards: prepared?.cards, failed: prepared != nil && prepared?.cards == nil,
        text: prepared?.info.text ?? entry.show.title, link: prepared?.info.link)
    }
    .task(id: membership.version) { prepared = await EntryShare.prepare(entry, photo: photo) }
  }
}

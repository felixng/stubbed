import SwiftUI

/// A diary or trip row: photo (or initials), title, venue and date, stars
/// (or "Going" for a planned show), trip chips and "Private".
struct EntryRow: View {
  let entry: Entry
  let photo: URL?

  var body: some View {
    HStack(spacing: Space.m) {
      Poster(title: entry.show.title, url: photo, width: 48, height: 64)
      VStack(alignment: .leading, spacing: 2) {
        Text(entry.show.title)
          .font(.headline)
          .lineLimit(2)
        Text([entry.venue?.name, Day.format(entry.date)].compactMap { $0 }.joined(separator: " · "))
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .lineLimit(1)
        if entry.planned {
          Text("Going")
            .font(.caption.weight(.semibold))
            .foregroundStyle(Palette.tintText)
        } else if let rating = entry.rating {
          RatingStars(value: rating, size: 13).padding(.vertical, 2)
        }
        // Trips and privacy as plain metadata, in the row grammar of Mail or Music.
        let trips = entry.trips.map(\.name).joined(separator: ", ")
        if !trips.isEmpty || entry.visibility == .private {
          HStack(spacing: Space.s) {
            if !trips.isEmpty { Label(trips, systemImage: "suitcase").lineLimit(1) }
            if entry.visibility == .private { Label("Private", systemImage: "lock.fill").fixedSize() }
          }
          .labelStyle(CompactLabel())
          .font(.caption)
          .foregroundStyle(.secondary)
        }
      }
    }
    .accessibilityElement(children: .combine)
  }
}

/// An icon and text a few points apart, for small metadata labels.
struct CompactLabel: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 3) {
      configuration.icon
      configuration.title
    }
  }
}

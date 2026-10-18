import SwiftUI

/// An inset grouped list of entries: photo (or initials), title, venue and date, stars (or
/// "Going" for a planned show), trip chips and "Private". Used by the diary
/// and trip screens. With `selection`, rows tick instead of opening.
struct EntryList: View {
  let entries: [Entry]
  let photos: [String: URL]
  var selection: Binding<Set<UUID>>?

  var body: some View {
    VStack(spacing: 0) {
      ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
        if index > 0 { Divider().padding(.leading, Space.l + 56 + Space.l) }
        if let selection {
          let picked = selection.wrappedValue.contains(entry.id)
          Button {
            if picked { selection.wrappedValue.remove(entry.id) } else { selection.wrappedValue.insert(entry.id) }
          } label: {
            HStack(spacing: Space.l) {
              Image(systemName: picked ? "checkmark.circle.fill" : "circle")
                .font(.title2)
                .foregroundStyle(picked ? AnyShapeStyle(Palette.tint) : AnyShapeStyle(.tertiary))
                .contentTransition(.symbolEffect(.replace))
              EntryRow(entry: entry, photo: entry.photoPath.flatMap { photos[$0] })
            }
            .padding(.horizontal, Space.l)
            .padding(.vertical, Space.m)
            .contentShape(.rect)
          }
          .pressableRow()
          .sensoryFeedback(.selection, trigger: picked)
          .accessibilityAddTraits(picked ? .isSelected : [])
        } else {
          NavigationLink(value: AppRouter.Route.entry(entry.id)) {
            HStack(spacing: Space.m) {
              EntryRow(entry: entry, photo: entry.photoPath.flatMap { photos[$0] })
              RowChevron()
            }
            .padding(.horizontal, Space.l)
            .padding(.vertical, Space.m)
          }
          .pressableRow()
        }
      }
    }
    .groupedCard()
  }
}

struct EntryRow: View {
  let entry: Entry
  let photo: URL?

  var body: some View {
    HStack(spacing: Space.l) {
      Poster(title: entry.show.title, url: photo)
      VStack(alignment: .leading, spacing: Space.xs) {
        Text(entry.show.title)
          .font(.headline)
          .foregroundStyle(.primary)
          .lineLimit(1)
        Text([entry.venue?.name, Day.format(entry.date)].compactMap { $0 }.joined(separator: " · "))
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .lineLimit(1)
        FlowLayout(spacing: Space.s) {
          if entry.planned {
            Text("Going")
              .font(.caption.weight(.medium))
              .foregroundStyle(Palette.tintText)
              .padding(.horizontal, Space.s)
              .frame(minHeight: 20)
              .background(Palette.tintFill, in: .capsule)
          } else if let rating = entry.rating {
            RatingStars(value: rating, size: 14).frame(minHeight: 20)
          }
          ForEach(entry.trips, id: \.id) { trip in
            Label(trip.name, systemImage: "suitcase")
              .font(.caption.weight(.medium))
              .foregroundStyle(.primary)
              .padding(.horizontal, Space.s)
              .frame(minHeight: 20)
              .background(Color(.tertiarySystemFill), in: .capsule)
          }
          if entry.visibility == .private {
            Label("Private", systemImage: "lock.fill")
              .font(.caption)
              .foregroundStyle(.secondary)
              .frame(minHeight: 20)
          }
        }
      }
      Spacer(minLength: 0)
    }
    .accessibilityElement(children: .combine)
  }
}

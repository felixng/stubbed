import PhotosUI
import SwiftUI

/// A visit's photo, read and its lookup started, ready for the log form.
struct PreparedPhoto: Sendable {
  let original: Data
  let lookup: PhotoLookup
}

/// One visit of a photo import, as the log form sees it.
struct ImportStep {
  let number: Int
  let total: Int
  let photo: Task<PreparedPhoto?, Never>
  let onSaved: (_ photoFailed: Bool) -> Void
  let onSkip: () -> Void
  let onStop: () -> Void
}

/// Import by picking photos (#155): the picked photos are grouped into
/// theatre visits on the device, then each visit opens the log form,
/// pre-filled from its photo, to save or skip. Nothing is stored between
/// sessions; stopping part-way keeps what was saved.
struct ImportView: View {
  let photos: [PhotosPickerItem]

  @Environment(AppRouter.self) private var router

  @State private var phase = Phase.reading
  @State private var read = 0
  @State private var visits: [Visit] = []
  @State private var unreadable = 0
  /// The current visit's photo and the next one's, loaded ahead.
  @State private var prepared: [Int: Task<PreparedPhoto?, Never>] = [:]
  @State private var logged = 0
  @State private var skipped = 0
  @State private var photoFailed = 0

  private enum Phase: Equatable { case reading, found, visit(Int), finished }

  struct Visit: Identifiable {
    let id = UUID()
    /// The visit's first photo, the one its entry starts from.
    let item: PhotosPickerItem
    let date: String?
    let count: Int
    let thumbnail: UIImage?
  }

  private var total: Int { min(photos.count, PhotoImport.maxPhotos) }

  var body: some View {
    if case .visit(let index) = phase, visits.indices.contains(index) {
      LogView(importing: step(index))
        .id(visits[index].id)
    } else {
      NavigationStack {
        Group {
          switch phase {
          case .reading: reading
          case .found:
            if visits.isEmpty { nothingFound } else { found }
          default: finished
          }
        }
        .navigationTitle("Import from photos")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbar }
      }
      .interactiveDismissDisabled(phase == .found && !visits.isEmpty)
      .task { await readPhotos() }
    }
  }

  @ToolbarContentBuilder private var toolbar: some ToolbarContent {
    switch phase {
    case .reading, .found:
      ToolbarItem(placement: .cancellationAction) {
        Button("Cancel") { router.finishImport(logged: 0) }
      }
      if phase == .found, !visits.isEmpty {
        ToolbarItem(placement: .confirmationAction) {
          Button("Start") { open(0) }.fontWeight(.semibold)
        }
      }
    default:
      ToolbarItem(placement: .confirmationAction) {
        Button("Done") { router.finishImport(logged: logged) }.fontWeight(.semibold)
      }
    }
  }

  // MARK: - Screens

  private var reading: some View {
    ProgressView("Reading \(min(read + 1, total)) of \(total) photos…")
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Color(.systemGroupedBackground))
  }

  private var found: some View {
    List {
      Section {
        VStack(alignment: .leading, spacing: Space.xs) {
          Text(Self.shows(visits.count))
            .font(.title2.bold())
          Text("From \(Self.photos(total - unreadable)). Go through them one at a time: save the shows you want and skip the rest.")
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: Space.s, leading: 0, bottom: Space.s, trailing: 0))
      }
      Section {
        ForEach(visits) { visit in
          HStack(spacing: Space.m) {
            Group {
              if let thumbnail = visit.thumbnail {
                Image(uiImage: thumbnail).resizable().scaledToFill()
              } else {
                Image(systemName: "photo")
                  .foregroundStyle(.secondary)
                  .frame(maxWidth: .infinity, maxHeight: .infinity)
                  .background(Color(.tertiarySystemFill))
              }
            }
            .frame(width: 48, height: 48)
            .clipShape(.rect(cornerRadius: Radius.sm, style: .continuous))
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
              Text(visit.date.map(Day.formatPost) ?? "No date")
                .font(.headline)
              Text(Self.photos(visit.count))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }
          }
          .accessibilityElement(children: .combine)
        }
      } footer: {
        if unreadable > 0 {
          Text("\(Self.photos(unreadable)) couldn’t be read.")
        }
      }
    }
    .listStyle(.insetGrouped)
  }

  private var nothingFound: some View {
    ContentUnavailableView(
      "Couldn’t read those photos", systemImage: "photo.badge.exclamationmark",
      description: Text("Try choosing them again, or start from one photo."))
  }

  private var finished: some View {
    ContentUnavailableView {
      Label(logged == 0 ? "Nothing logged" : "\(Self.shows(logged)) logged", systemImage: "checkmark.circle")
    } description: {
      Text(finishedDetail)
    }
  }

  private var finishedDetail: String {
    var parts: [String] = []
    if skipped > 0 { parts.append("You skipped \(Self.shows(skipped)).") }
    if photoFailed > 0 {
      parts.append(photoFailed == 1
        ? "One photo didn’t upload; add it again from its entry."
        : "\(photoFailed) photos didn’t upload; add them again from their entries.")
    }
    if parts.isEmpty { parts.append(logged == 0 ? "Pick photos again whenever you like." : "They’re in your diary.") }
    return parts.joined(separator: " ")
  }

  static func shows(_ n: Int) -> String { n == 1 ? "1 show" : "\(n) shows" }
  static func photos(_ n: Int) -> String { n == 1 ? "1 photo" : "\(n) photos" }

  // MARK: - Steps

  /// Reads each photo once for its date and place (and a thumbnail), then
  /// lets it go; the visits keep only a reference to their first photo.
  private func readPhotos() async {
    guard phase == .reading, visits.isEmpty else { return }
    struct Read {
      let item: PhotosPickerItem
      let meta: PhotoMeta
      let thumbnail: UIImage?
    }
    var all: [Read] = []
    for item in photos.prefix(PhotoImport.maxPhotos) {
      if let data = try? await item.loadTransferable(type: Data.self) {
        let thumbnail = (try? Photo.jpeg(from: data, maxEdge: 144, quality: 0.7)).flatMap(UIImage.init(data:))
        all.append(Read(item: item, meta: PhotoMeta.read(data), thumbnail: thumbnail))
      } else {
        unreadable += 1
      }
      read += 1
    }
    visits = PhotoImport.group(all, meta: \.meta).map { group in
      Visit(item: group[0].item, date: group[0].meta.date, count: group.count, thumbnail: group[0].thumbnail)
    }
    phase = .found
  }

  /// Opens a visit, loading its photo (if not already) and the next one's.
  private func open(_ index: Int) {
    prepare(index)
    prepare(index + 1)
    phase = .visit(index)
  }

  private func prepare(_ index: Int) {
    guard visits.indices.contains(index), prepared[index] == nil else { return }
    let item = visits[index].item
    prepared[index] = Task {
      guard let data = try? await item.loadTransferable(type: Data.self) else { return nil }
      return PreparedPhoto(original: data, lookup: PhotoLookup(data: data))
    }
  }

  private func next(after index: Int) {
    prepared[index] = nil
    if index + 1 < visits.count { open(index + 1) } else { phase = .finished }
  }

  /// A visit's Save and Skip only count while that visit is on screen: the
  /// outgoing form can still take a tap while the next one slides in, and
  /// acting on it would skip a visit twice.
  private func step(_ index: Int) -> ImportStep {
    ImportStep(
      number: index + 1, total: visits.count, photo: prepared[index] ?? Task { nil },
      onSaved: { failed in
        guard phase == .visit(index) else { return }
        logged += 1
        if failed { photoFailed += 1 }
        next(after: index)
      },
      onSkip: {
        guard phase == .visit(index) else { return }
        skipped += 1
        next(after: index)
      },
      onStop: { router.finishImport(logged: logged) })
  }
}

import Photos
import Supabase
import SwiftUI
import UIKit

let stubbedInstagram = cardDomain
typealias ShareAsset = (file: URL, image: UIImage)
struct RenderedCard: Identifiable {
  let id: String
  let name: String
  let file: URL
  let image: UIImage
  var backgrounds: [ShareAppearance: ShareAsset] = [:]
  var showsRating = false
  var supportsBackground: Bool { !backgrounds.isEmpty }
  func asset(for appearance: ShareAppearance) -> ShareAsset {
    let key = ShareAppearance(background: appearance.background, ink: appearance.background == .transparent ? appearance.ink : .light)
    return backgrounds[key] ?? (file, image)
  }
  func isTransparent(_ appearance: ShareAppearance) -> Bool { supportsBackground && appearance.background == .transparent }
}
enum ShareCards {
  @MainActor static func render<V: View>(_ view: V, name: String) throws -> ShareAsset {
    let renderer = ImageRenderer(content: view)
    renderer.scale = 2
    renderer.isOpaque = false
    guard let image = renderer.uiImage, let png = image.pngData() else { throw Photo.Failure.unreadable }
    // Two visits to the same show may stay open in different navigation
    // screens. Their exported files must not overwrite one another.
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("share-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let file = directory.appendingPathComponent("\(name).png")
    try png.write(to: file, options: .atomic)
    return (file, image)
  }
  static func slug(_ title: String) -> String {
    let parts = title.lowercased().split { !($0.isASCII && ($0.isLetter || $0.isNumber)) }
    return parts.isEmpty ? "show" : parts.joined(separator: "-")
  }
  @MainActor static func entryCards(_ data: EntryCardData, photo: UIImage?) throws -> [RenderedCard] {
    try EntryCardDesign.available(photo: photo != nil, rating: data.rating, timesSeen: data.timesSeen).map { design in
      let name = "stubbed-\(slug(data.title))-\(design.id)"
      let full = try render(EntryCardView(design: design, data: data, photo: photo), name: name)
      var variants: [ShareAppearance: ShareAsset] = [:]
      if !design.isPhoto {
        for appearance in ShareAppearance.variants {
          variants[appearance] = try render(EntryCardView(design: design, data: data, photo: nil, appearance: appearance), name: "\(name)-\(appearance.key)")
        }
      }
      return RenderedCard(id: design.id, name: design.name, file: full.file, image: full.image, backgrounds: variants, showsRating: design == .name)
    }
  }
  struct Stats: Decodable, Sendable {
    let show_of_year: Int
    let venue_visit: Int
    let times_seen: Int
  }
  static func stats(_ entryId: UUID) async throws -> Stats {
    try await supabase.rpc("entry_card_stats", params: ["entry_id": entryId]).single().execute().value
  }
  static func image(_ url: URL?) async -> UIImage? {
    guard let url, let (data, _) = try? await URLSession.shared.data(from: url) else { return nil }
    return UIImage(data: data)
  }
}
struct ShareCarousel: View {
  enum Subject { case show, trip, insights }
  let subject: Subject
  let cards: [RenderedCard]?
  var failed = false
  let text: String
  var link: URL?
  @Environment(\.sharePreviewSize) private var previewSize
  @Environment(\.dynamicTypeSize) private var typeSize
  @State private var active: String?
  @State private var appearance = ShareAppearance.standard
  @State private var notice: String?
  @State private var sharing: SharePayload?
  private struct SharePayload: Identifiable {
    let id = UUID()
    let items: [Any]
    let action: String
  }
  private var current: RenderedCard? { cards?.first(where: { $0.id == active }) ?? cards?.first }
  private var currentAsset: ShareAsset? { current?.asset(for: appearance) }
  private var selection: Binding<String> {
    Binding(get: { current?.id ?? "loading" }, set: { active = $0 })
  }
  var body: some View {
    VStack(spacing: Space.m) {
      TabView(selection: selection) {
        if let cards, !cards.isEmpty {
          ForEach(Array(cards.enumerated()), id: \.element.id) { index, card in cardImage(card, index: index).tag(card.id) }
        } else {
          RoundedRectangle(cornerRadius: 20).fill(Color(.tertiarySystemFill))
            .overlay {
              if failed { Text("Couldn’t draw this card.").font(.subheadline).foregroundStyle(.secondary) }
              else { Image(systemName: "ticket").font(.largeTitle).foregroundStyle(.quaternary).redacted(reason: .placeholder) }
            }.accessibilityLabel(failed ? "Couldn’t draw cards" : "Preparing share cards").tag("loading")
        }
      }.tabViewStyle(.page(indexDisplayMode: .never)).aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: previewSize).accessibilityLabel("Card designs")
      HStack(spacing: 8) {
        ForEach(cards ?? []) { card in
          Circle().fill(card.id == current?.id ? AnyShapeStyle(Palette.tint) : AnyShapeStyle(.quaternary)).frame(width: 7, height: 7)
        }
      }.accessibilityHidden(true)
      if current?.supportsBackground == true {
        Picker("Background", selection: $appearance.background) {
          ForEach(ShareBackground.allCases) { option in Text(option.name).tag(option) }
        }.pickerStyle(.segmented).accessibilityIdentifier("share-background")
        if appearance.background == .transparent {
          Picker("Text colour", selection: $appearance.ink) {
            ForEach(ShareInk.allCases) { option in Text(option.name).tag(option) }
          }.pickerStyle(.segmented).accessibilityIdentifier("share-ink")
        }
      }
      Text("Tag \(stubbedInstagram)").font(.footnote).foregroundStyle(.secondary)
      LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: typeSize.isAccessibilitySize ? 2 : 3), spacing: Space.m) {
        action("Stories", systemImage: "camera") { Task { await shareToStories() } }.disabled(current == nil)
        action("More", systemImage: "square.and.arrow.up") { share(withText: true) }.disabled(current == nil)
        action("Download", systemImage: "arrow.down.to.line") { Task { await download() } }.disabled(current == nil)
        if !text.isEmpty {
          action("Copy text", systemImage: "doc.on.doc") {
            UIPasteboard.general.string = text
            record("copy_text")
            notice = "Text copied."
          }
        }
        if let link {
          action("Link", systemImage: "link") {
            UIPasteboard.general.url = link
            record("copy_link")
            notice = "Link copied."
          }
        }
      }
      if let notice { Text(notice).font(.footnote).foregroundStyle(.secondary) }
    }
    .onChange(of: notice) { _, value in if let value { AccessibilityNotification.Announcement(value).post() } }
    .sheet(item: $sharing) { payload in
      ActivityView(items: payload.items) { completed in
        sharing = nil
        if completed { record(payload.action) }
      }.presentationDetents([.medium, .large])
    }
  }
  private func cardImage(_ card: RenderedCard, index: Int) -> some View {
    ZStack {
      if card.isTransparent(appearance) { Checkerboard() }
      Image(uiImage: card.asset(for: appearance).image).resizable().scaledToFit()
        .accessibilityLabel("Share card \(index + 1) of \(cards?.count ?? 0), \(card.name.lowercased())\(card.isTransparent(appearance) ? ", no background" : "")")
    }.clipShape(.rect(cornerRadius: 20))
  }
  private func action(_ label: String, systemImage: String, perform: @escaping () -> Void) -> some View {
    Button(action: perform) {
      VStack(spacing: 6) {
        Image(systemName: systemImage).font(.title3).frame(height: 28)
        Text(label).font(.footnote).lineLimit(2)
      }.frame(maxWidth: .infinity, minHeight: 56)
    }.buttonStyle(.bordered)
  }
  private func shareToStories() async {
    guard let current, let asset = currentAsset else { return }
    if await InstagramStories.share(asset.image, transparent: current.isTransparent(appearance)) {
      notice = nil
      record("stories")
    } else { share(withText: false) }
  }
  private func share(withText: Bool) {
    guard let asset = currentAsset else { return }
    notice = nil
    let items: [Any] = withText && !text.isEmpty ? [asset.file, text] : [asset.file]
    sharing = SharePayload(items: items, action: withText ? "more" : "stories")
  }
  private func download() async {
    guard let file = currentAsset?.file else { return }
    let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
    guard status == .authorized || status == .limited else {
      notice = "Allow Stubbed to add photos in Settings to save the card."
      return
    }
    do {
      try await PHPhotoLibrary.shared().performChanges {
        PHAssetCreationRequest.forAsset().addResource(with: .photo, fileURL: file, options: nil)
      }
      record("download")
      notice = "Saved to Photos."
    } catch { notice = "Couldn’t save the image." }
  }
  private func record(_ action: String) {
    guard let current else { return }
    Analytics.track(.cardShared, [
      "action": .string(action), "design": .string(current.id),
      "background": .string(current.supportsBackground ? appearance.background.rawValue : "photo"),
      "transparent": .bool(current.isTransparent(appearance)), "platform": .string("ios"), "rating": .bool(current.showsRating),
    ])
  }
}

/// The grey checks that mean "no background".
struct Checkerboard: View {
  var body: some View {
    Canvas { context, size in
      let cell: CGFloat = 14
      context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(white: 0.28)))
      for row in 0..<Int(size.height / cell + 1) {
        for col in 0..<Int(size.width / cell + 1) where (row + col).isMultiple(of: 2) {
          context.fill(
            Path(CGRect(x: CGFloat(col) * cell, y: CGFloat(row) * cell, width: cell, height: cell)),
            with: .color(Color(white: 0.36)))
        }
      }
    }
  }
}

/// The system share sheet.
struct ActivityView: UIViewControllerRepresentable {
  let items: [Any]
  let onDone: (Bool) -> Void

  func makeUIViewController(context: Context) -> UIActivityViewController {
    let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
    controller.completionWithItemsHandler = { _, completed, _, _ in onDone(completed) }
    return controller
  }

  func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

extension Array {
  subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}

/// The Share screen, as Hevy's: a sheet (sharing is a task of its own) with
/// the card at the full width of the screen, the designs to swipe through
/// and the ways to send it, and Done in the bar.
struct ShareScreen<Content: View>: View {
  var title = "Share"
  @ViewBuilder var content: Content

  @Environment(\.dismiss) private var dismiss
  @ScaledMetric(relativeTo: .body) private var controlsHeight: CGFloat = 350

  var body: some View {
    NavigationStack {
      GeometryReader { geometry in
        ScrollView {
          content
            .environment(\.sharePreviewSize, max(180, geometry.size.height - controlsHeight))
            .padding(.horizontal, Space.l)
            .padding(.top, Space.s)
            .padding(.bottom, Space.xl)
        }
      }
      .background(Color(.systemGroupedBackground))
      .navigationTitle(title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
      }
    }
  }
}

private struct SharePreviewSizeKey: EnvironmentKey {
  static let defaultValue: CGFloat = 540
}

extension EnvironmentValues {
  var sharePreviewSize: CGFloat {
    get { self[SharePreviewSizeKey.self] }
    set { self[SharePreviewSizeKey.self] = newValue }
  }
}

/// The row that opens the Share screen from a detail screen: the first card
/// as a thumbnail, so it's clear what you'll get.
struct ShareRow: View {
  let title: String
  let preview: UIImage?
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: Space.m) {
        Group {
          if let preview {
            Image(uiImage: preview).resizable().scaledToFill()
          } else {
            Color(.tertiarySystemFill).overlay {
              Image(systemName: "photo.on.rectangle").foregroundStyle(.secondary)
            }
          }
        }
        .frame(width: 56, height: 56)
        .clipShape(.rect(cornerRadius: Radius.sm, style: .continuous))
        .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          Text(title).foregroundStyle(.primary)
          Text("Cards for Instagram Stories and more").font(.footnote).foregroundStyle(.secondary)
        }
        Spacer(minLength: 0)
        Image(systemName: "square.and.arrow.up").foregroundStyle(.tint).accessibilityHidden(true)
      }
      .contentShape(.rect)
    }
    // Plain, so a Form doesn't tint the whole label: only the icon is coral.
    .buttonStyle(.plain)
    .accessibilityLabel(title)
  }
}

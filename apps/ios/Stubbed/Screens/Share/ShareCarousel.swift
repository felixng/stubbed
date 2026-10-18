import Photos
import Supabase
import SwiftUI
import UIKit

/// Stubbed's Instagram account, tagged in the caption and the copied text.
let stubbedInstagram = "@stubbedapp"

/// A drawn card: the image with its background and, for entry cards, the
/// same card without it (text only, for laying over your own story photo).
struct RenderedCard: Identifiable {
  let id: String
  let name: String
  let file: URL
  let image: UIImage
  var clear: (file: URL, image: UIImage)?
}

enum ShareCards {
  /// Draws a 540pt card view as a 1080px PNG in the temporary folder, named
  /// like the web's downloads ("stubbed-hamilton-square.png").
  @MainActor
  static func render<V: View>(_ view: V, name: String) throws -> (file: URL, image: UIImage) {
    let renderer = ImageRenderer(content: view)
    renderer.scale = 2
    renderer.isOpaque = false
    guard let image = renderer.uiImage, let png = image.pngData() else { throw Photo.Failure.unreadable }
    let file = FileManager.default.temporaryDirectory.appendingPathComponent("\(name).png")
    try png.write(to: file, options: .atomic)
    return (file, image)
  }

  /// "operation-mincemeat"
  static func slug(_ title: String) -> String {
    let parts = title.lowercased().split { !($0.isASCII && ($0.isLetter || $0.isNumber)) }
    return parts.isEmpty ? "show" : parts.joined(separator: "-")
  }

  /// Draws every entry design, with and without its background.
  @MainActor
  static func entryCards(_ data: EntryCardData, photo: UIImage?) throws -> [RenderedCard] {
    let slug = slug(data.title)
    return try EntryCardDesign.allCases.map { design in
      let name = "stubbed-\(slug)-\(design.id)"
      let full = try render(EntryCardView(design: design, data: data, photo: photo), name: name)
      let clear = try render(EntryCardView(design: design, data: data, photo: nil, transparent: true), name: "\(name)-clear")
      return RenderedCard(id: design.id, name: design.name, file: full.file, image: full.image, clear: clear)
    }
  }

  /// The numbers on an entry's cards, from Postgres so they match the web.
  struct Stats: Decodable, Sendable {
    let show_of_year: Int
    let venue_visit: Int
    let times_seen: Int
  }

  static func stats(_ entryId: UUID) async throws -> Stats {
    try await supabase.rpc("entry_card_stats", params: ["entry_id": entryId]).single().execute().value
  }

  /// Downloads a photo for drawing; nil if there isn't one or it fails.
  static func image(_ url: URL?) async -> UIImage? {
    guard let url, let (data, _) = try? await URLSession.shared.data(from: url) else { return nil }
    return UIImage(data: data)
  }
}

/// Hevy-style share screen, like the web's ShareSheet: swipe between card
/// designs, optionally drop the background (entry cards), then send the card
/// in view to an Instagram story, the share sheet or Photos.
struct ShareCarousel: View {
  enum Subject { case show, trip }

  let subject: Subject
  /// nil while the cards are drawn.
  let cards: [RenderedCard]?
  var failed = false
  /// The caption for "More" and "Copy text".
  let text: String
  /// The public page, for the Link button; nil when private.
  var link: URL?

  @State private var active = 0
  @State private var transparent = false
  @State private var notice: String?
  @State private var sharing: SharePayload?

  private struct SharePayload: Identifiable {
    let id = UUID()
    let items: [Any]
    let action: String
  }

  private var current: RenderedCard? { cards?[safe: active] }
  private var currentFile: URL? {
    guard let current else { return nil }
    return transparent ? current.clear?.file ?? current.file : current.file
  }

  var body: some View {
    VStack(spacing: Space.l) {
      TabView(selection: $active) {
        ForEach(Array(shown.enumerated()), id: \.offset) { index, card in
          cardImage(card, index: index)
            .padding(.horizontal, 2)
            .tag(index)
        }
      }
      .tabViewStyle(.page(indexDisplayMode: .never))
      .aspectRatio(1, contentMode: .fit)
      .accessibilityLabel("Card designs")

      HStack(spacing: Space.s) {
        ForEach(0..<shown.count, id: \.self) { i in
          Circle()
            .fill(i == active ? AnyShapeStyle(Palette.tint) : AnyShapeStyle(.quaternary))
            .frame(width: 8, height: 8)
        }
      }
      .accessibilityHidden(true)

      (Text("Share your \(subject == .show ? "show" : "trip") · Tag ") + Text(stubbedInstagram).fontWeight(.semibold))
        .font(.callout)
        .foregroundStyle(.primary)

      ScrollView(.horizontal, showsIndicators: false) {
        HStack(alignment: .top, spacing: Space.m) {
          if subject == .show {
            action("Background", selected: !transparent) {
              ZStack {
                if transparent { Checkerboard() } else { Color.primary }
                Image(systemName: "line.diagonal")
                  .font(.title2.weight(.medium))
                  .foregroundStyle(Color(.systemBackground))
              }
            } perform: {
              transparent.toggle()
            }
            .disabled(cards == nil)
            Divider().frame(height: 48).padding(.top, 4)
          }
          action("Stories") {
            ZStack {
              RadialGradient(
                colors: [
                  Color(red: 0.99, green: 0.96, blue: 0.59), Color(red: 0.99, green: 0.35, blue: 0.29),
                  Color(red: 0.84, green: 0.14, blue: 0.62), Color(red: 0.16, green: 0.35, blue: 0.92),
                ], center: UnitPoint(x: 0.3, y: 1.07), startRadius: 0, endRadius: 70)
              Image(systemName: "camera")
                .font(.title2.weight(.medium))
                .foregroundStyle(.white)
            }
          } perform: {
            share(withText: false)
          }
          .disabled(cards == nil)
          action("More", systemImage: "square.and.arrow.up") { share(withText: true) }
            .disabled(cards == nil)
          action("Download", systemImage: "arrow.down.to.line") { Task { await download() } }
            .disabled(cards == nil)
          action("Copy text", systemImage: "doc.on.doc") {
            UIPasteboard.general.string = text
            record("copy_text")
            notice = "Text copied."
          }
          if let link {
            action("Link", systemImage: "link") {
              UIPasteboard.general.url = link
              record("copy_link")
              notice = "Link copied."
            }
          }
        }
        .padding(.horizontal, Space.l)
      }
      .padding(.horizontal, -Space.l)

      Text(notice ?? " ")
        .font(.footnote)
        .foregroundStyle(.secondary)
        .accessibilityHidden(notice == nil)
    }
    .onChange(of: notice) { _, value in
      if let value { AccessibilityNotification.Announcement(value).post() }
    }
    .sheet(item: $sharing) { payload in
      ActivityView(items: payload.items) { completed in
        sharing = nil
        if completed { record(payload.action) }
      }
      .presentationDetents([.medium, .large])
    }
  }

  /// The drawn cards, or empty slots while they're drawn.
  private var shown: [RenderedCard?] {
    cards.map { $0.map(Optional.some) } ?? Array(repeating: nil, count: subject == .show ? 3 : 4)
  }

  @ViewBuilder private func cardImage(_ card: RenderedCard?, index: Int) -> some View {
    let clear = transparent && card?.clear != nil
    ZStack {
      if clear { Checkerboard() }
      if let card {
        Image(uiImage: clear ? card.clear!.image : card.image)
          .resizable()
          .scaledToFit()
          .accessibilityLabel("Share card \(index + 1) of \(cards?.count ?? 0), \(card.name.lowercased())\(clear ? ", no background" : "")")
      } else {
        Color(.tertiarySystemFill).overlay {
          Text(failed ? "Couldn’t draw this card." : "Drawing…")
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
      }
    }
    .clipShape(.rect(cornerRadius: 20, style: .continuous))
  }

  private func action<Icon: View>(
    _ label: String, selected: Bool? = nil, @ViewBuilder icon: () -> Icon, perform: @escaping () -> Void
  ) -> some View {
    Button(action: perform) {
      VStack(spacing: 6) {
        icon()
          .frame(width: 56, height: 56)
          .clipShape(Circle())
        Text(label)
          .font(.footnote)
          .foregroundStyle(.primary)
          .lineLimit(1)
          .fixedSize()
      }
      .frame(minWidth: 72)
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selected == true ? .isSelected : [])
  }

  private func action(_ label: String, systemImage: String, perform: @escaping () -> Void) -> some View {
    action(label) {
      ZStack {
        Color(.secondarySystemGroupedBackground)
        Image(systemName: systemImage)
          .font(.title3.weight(.medium))
          .foregroundStyle(Palette.tintText)
      }
    } perform: {
      perform()
    }
  }

  /// Image only for Stories: Instagram's share sheet entry drops the image
  /// when text comes with it.
  private func share(withText: Bool) {
    guard let file = currentFile else { return }
    notice = nil
    sharing = SharePayload(items: withText ? [file, text] : [file], action: withText ? "more" : "stories")
  }

  private func download() async {
    guard let file = currentFile else { return }
    notice = nil
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
    } catch {
      notice = "Couldn’t save the image."
    }
  }

  private func record(_ action: String) {
    let designs = cards?.map(\.id) ?? []
    Analytics.track(
      .cardShared,
      [
        "action": .string(action), "design": .string(designs[safe: active] ?? ""),
        "transparent": .bool(transparent && subject == .show), "platform": .string("ios"),
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

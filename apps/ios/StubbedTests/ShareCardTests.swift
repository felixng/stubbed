import Testing
import UIKit
import UniformTypeIdentifiers
@testable import Stubbed

struct ShareCardTests {
  private var data: EntryCardData {
    EntryCardData(title: "Operation Mincemeat", venue: "Fortune Theatre", whereText: "London",
      date: "1 Nov 2026", year: 2026, rating: 1.5, showOfYear: 24, venueVisit: 3, timesSeen: 5, handle: "sillyelphaba")
  }

  @Test @MainActor func backgroundsNeverReplacePhotoExports() throws {
    let photo = UIGraphicsImageRenderer(size: CGSize(width: 20, height: 20)).image { context in
      UIColor.blue.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 20, height: 20))
    }
    let cards = try ShareCards.entryCards(data, photo: photo)
    let rating = try #require(cards.first { $0.id == "name" })
    #expect(rating.showsRating) // A low score is still present.
    for card in cards.filter({ !$0.supportsBackground }) {
      for appearance in ShareAppearance.variants {
        #expect(card.asset(for: appearance).file == card.file)
        #expect(!card.isTransparent(appearance))
      }
    }
    for id in ["overlay", "ticket"] {
      let overlay = try #require(cards.first { $0.id == id })
      let clear = overlay.asset(for: .init(background: .transparent))
      #expect(alpha(clear.image) == 0)
      #expect(alpha(clear.image, at: bodyPoint(clear.image)) == 0)
      #expect(overlay.asset(for: .init(background: .transparent, ink: .dark)).file != clear.file)
    }
    let background = try #require(cards.first { $0.id == "data" })
    let clear = background.asset(for: .init(background: .transparent))
    #expect(clear.image.cgImage?.width == 1080)
    #expect(clear.image.cgImage?.height == 1080)
    #expect(alpha(clear.image) == 0)
    // The card body is opaque; only the rounded corners (#349) are clear.
    #expect(alpha(background.image, at: bodyPoint(background.image)) == 255)
    #expect(alpha(background.image, at: CGPoint(x: 1, y: 1)) == 0)
    #expect(background.asset(for: .init(background: .transparent, ink: .dark)).file != clear.file)
    // Light is its own export, opaque, and ignores a text colour left over
    // from transparent.
    let light = background.asset(for: .init(background: .light))
    #expect(light.file != background.file)
    #expect(alpha(light.image, at: bodyPoint(light.image)) == 255)
    #expect(background.asset(for: .init(background: .light, ink: .dark)).file == light.file)
  }

  @Test @MainActor func copyImagePreservesPNGTransparency() throws {
    let asset = try ShareCards.render(EntryCardView(design: .data, data: data, photo: nil,
      appearance: .init(background: .transparent)), name: "copy-card")
    let pasteboard = UIPasteboard.withUniqueName()
    defer { UIPasteboard.remove(withName: pasteboard.name) }
    try ShareCards.copyImage(asset, to: pasteboard)
    let copied = try #require(pasteboard.data(forPasteboardType: UTType.png.identifier))
    #expect(copied == (try Data(contentsOf: asset.file)))
    #expect(alpha(try #require(UIImage(data: copied))) == 0)
  }

  @Test func onlyTransparentLetsTextColourChange() {
    #expect(ShareAppearance(background: .light).foreground == ShareInk.dark.color)
    #expect(ShareAppearance(background: .light, ink: .light).foreground == ShareInk.dark.color)
    #expect(ShareAppearance(background: .dark, ink: .dark).foreground == ShareInk.light.color)
    #expect(ShareAppearance(background: .transparent, ink: .dark).foreground == ShareInk.dark.color)
  }

  @Test func missingInputsDoNotFabricatePhotoCards() {
    let photoLess = EntryCardDesign.available(photo: false, rating: 5, timesSeen: 1)
    #expect(photoLess.filter { $0.isPhoto }.isEmpty)
    #expect(!EntryCardDesign.available(photo: true, rating: nil, timesSeen: 1).contains(.name))
    #expect(EntryCardDesign.available(photo: true, rating: 0.5, timesSeen: 1).contains(.name))
    #expect(EntryCardDesign.available(photo: true, rating: 5, timesSeen: 1).contains(.encore))
    #expect(EntryCardDesign.available(photo: false, rating: nil, timesSeen: 2) == [.data, .encore, .number, .overlay, .ticket])
    #expect(EntryCardDesign.available(photo: true, rating: 1, timesSeen: 5) == [.stats, .name, .data, .encore, .number, .overlay, .ticket])
  }

  @Test func seenCountGrammarAndVenueEligibility() {
    #expect(formatTimes(0) == "0 times")
    #expect(formatTimes(1) == "1 time")
    #expect(formatTimes(2) == "2 times")
    func designs(_ venue: String?, _ count: Int) -> [EntryCardDesign] {
      EntryCardDesign.available(photo: false, rating: nil, timesSeen: 1, venue: venue, venueVisit: count)
    }
    #expect(designs("Fortune Theatre", 3).contains(.venue))
    #expect(!designs(nil, 3).contains(.venue))
    #expect(!designs(" ", 3).contains(.venue))
    #expect(!designs("Fortune Theatre", 0).contains(.venue))
  }

  @Test @MainActor func repeatedRendersCannotOverwriteAnEarlierExport() throws {
    let first = try ShareCards.render(EntryCardView(design: .data, data: data, photo: nil), name: "same-show")
    var later = data
    later.showOfYear += 1
    let second = try ShareCards.render(EntryCardView(design: .data, data: later, photo: nil), name: "same-show")
    #expect(first.file != second.file)
    #expect(first.file.lastPathComponent == second.file.lastPathComponent)
    let firstBytes = try Data(contentsOf: first.file)
    let secondBytes = try Data(contentsOf: second.file)
    #expect(firstBytes != secondBytes)
  }

  /// A point inside the card, clear of the rounded corners and the text.
  private func bodyPoint(_ image: UIImage) -> CGPoint {
    CGPoint(x: 8, y: CGFloat(image.cgImage?.height ?? 0) / 2)
  }

  /// The alpha of one pixel (in image pixels, from the top left).
  private func alpha(_ image: UIImage, at point: CGPoint) -> UInt8 {
    guard let cg = image.cgImage,
      let pixelImage = cg.cropping(to: CGRect(x: point.x, y: point.y, width: 1, height: 1))
    else { return 1 }
    var pixel: [UInt8] = [0, 0, 0, 0]
    let context = CGContext(data: &pixel, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.draw(pixelImage, in: CGRect(x: 0, y: 0, width: 1, height: 1))
    return pixel[3]
  }

  private func alpha(_ image: UIImage) -> UInt8 {
    guard let cg = image.cgImage else { return 1 }
    var pixel: [UInt8] = [0, 0, 0, 0]
    let context = CGContext(data: &pixel, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
    return pixel[3]
  }
}

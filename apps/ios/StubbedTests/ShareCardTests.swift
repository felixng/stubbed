import Testing
import UIKit
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
    let background = try #require(cards.first { $0.id == "data" })
    let clear = background.asset(for: .init(background: .transparent))
    #expect(clear.image.cgImage?.width == 1080)
    #expect(clear.image.cgImage?.height == 1080)
    #expect(alpha(clear.image) == 0)
    #expect(alpha(background.image) == 255)
    #expect(background.asset(for: .init(background: .transparent, ink: .dark)).file != clear.file)
  }

  @Test func missingInputsDoNotFabricatePhotoCards() {
    let photoLess = EntryCardDesign.available(photo: false, rating: 5, timesSeen: 1)
    #expect(photoLess.filter { $0.isPhoto }.isEmpty)
    #expect(!EntryCardDesign.available(photo: true, rating: nil, timesSeen: 1).contains(.name))
    #expect(EntryCardDesign.available(photo: true, rating: 0.5, timesSeen: 1).contains(.name))
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

  private func alpha(_ image: UIImage) -> UInt8 {
    guard let cg = image.cgImage else { return 1 }
    var pixel: [UInt8] = [0, 0, 0, 0]
    let context = CGContext(data: &pixel, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
    return pixel[3]
  }
}

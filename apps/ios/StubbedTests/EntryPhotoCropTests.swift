import ImageIO
import Testing
import UIKit
import UniformTypeIdentifiers
@testable import Stubbed

struct EntryPhotoCropTests {
  @Test(arguments: [CGSize(width: 1600, height: 800), CGSize(width: 800, height: 1600),
                    CGSize(width: 1, height: 3)])
  func centeredCropIsSquareInPixels(source: CGSize) {
    let crop = EntryPhotoCrop.centered(in: source)
    let normalized = crop.normalized(in: source)
    #expect(abs(normalized[2] * source.width - normalized[3] * source.height) < 0.001)
    #expect(normalized[0] + normalized[2] <= 1)
    #expect(normalized[1] + normalized[3] <= 1)
  }

  @Test func panClampsAtImageEdges() {
    let crop = EntryPhotoCrop(center: CGPoint(x: 400, y: -40), side: 20,
                              source: CGSize(width: 80, height: 40))
    #expect(crop.origin == CGPoint(x: 60, y: 0))
    #expect(crop.side == 20)
  }

  @Test(arguments: Array(1...8))
  func retainedSourceAppliesExifOrientation(_ orientation: Int) throws {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let image = UIGraphicsImageRenderer(size: CGSize(width: 80, height: 40), format: format).image {
      UIColor.orange.setFill()
      $0.fill(CGRect(x: 0, y: 0, width: 80, height: 40))
    }
    let encoded = NSMutableData()
    let destination = try #require(CGImageDestinationCreateWithData(
      encoded, UTType.jpeg.identifier as CFString, 1, nil
    ))
    CGImageDestinationAddImage(destination, try #require(image.cgImage),
                              [kCGImagePropertyOrientation: orientation] as CFDictionary)
    try #require(CGImageDestinationFinalize(destination))
    let retained = try Photo.resizedJPEG(from: encoded as Data, maxEdge: Photo.storedEdge)
    let source = try #require(UIImage(data: retained)?.cgImage)
    #expect(source.width == (orientation >= 5 ? 40 : 80))
    #expect(source.height == (orientation >= 5 ? 80 : 40))
    let crop = EntryPhotoCrop.centered(in: CGSize(width: source.width, height: source.height))
    let result = try crop.derivatives(from: source)
    #expect(UIImage(data: result.display)?.size == CGSize(width: 40, height: 40))
  }

  @Test func derivativesAreSquareAndSourceIsUnchanged() throws {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let image = UIGraphicsImageRenderer(size: CGSize(width: 800, height: 600), format: format).image {
      UIColor.orange.setFill()
      $0.fill(CGRect(x: 0, y: 0, width: 800, height: 600))
    }
    let source = try #require(image.cgImage)
    let first = try EntryPhotoCrop.centered(in: image.size).derivatives(from: source)
    let second = try EntryPhotoCrop(center: CGPoint(x: 300, y: 300), side: 250, source: image.size)
      .derivatives(from: source)
    #expect(UIImage(data: first.display)?.size == CGSize(width: 600, height: 600))
    #expect(UIImage(data: first.thumbnail)?.size == CGSize(width: 400, height: 400))
    #expect(UIImage(data: second.display)?.size == CGSize(width: 250, height: 250))
    #expect(source.width == 800 && source.height == 600)
  }
}

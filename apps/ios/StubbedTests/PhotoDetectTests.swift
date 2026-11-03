import Foundation
import ImageIO
import Testing
import UIKit
import UniformTypeIdentifiers
@testable import Stubbed

struct PhotoDetectTests {
  /// A small JPEG carrying the EXIF date and GPS a phone camera writes.
  private func photo(lat: Double, latRef: String, lng: Double, lngRef: String, taken: String) throws -> Data {
    let image = UIGraphicsImageRenderer(size: CGSize(width: 40, height: 30)).image { context in
      UIColor.orange.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 40, height: 30))
    }
    let data = NSMutableData()
    let dest = try #require(CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil))
    let props: [CFString: Any] = [
      kCGImagePropertyExifDictionary: [kCGImagePropertyExifDateTimeOriginal: taken],
      kCGImagePropertyGPSDictionary: [
        kCGImagePropertyGPSLatitude: lat, kCGImagePropertyGPSLatitudeRef: latRef,
        kCGImagePropertyGPSLongitude: lng, kCGImagePropertyGPSLongitudeRef: lngRef,
        kCGImagePropertyGPSHPositioningError: 12.0,
      ],
    ]
    CGImageDestinationAddImage(dest, try #require(image.cgImage), props as CFDictionary)
    #expect(CGImageDestinationFinalize(dest))
    return data as Data
  }

  @Test func readsDateTimeAndLocationFromExif() throws {
    let data = try photo(lat: 40.7590, latRef: "N", lng: 73.9845, lngRef: "W", taken: "2026:10:05 19:42:10")
    let meta = PhotoMeta.read(data)
    #expect(meta.date == "2026-10-05")
    #expect(meta.time == "19:42")
    #expect(abs((meta.lat ?? 0) - 40.7590) < 0.0001)
    #expect(abs((meta.lng ?? 0) + 73.9845) < 0.0001)
    #expect(meta.accuracy == 12)
  }

  @Test func storedCopiesHaveNoLocation() throws {
    let data = try photo(lat: 51.5, latRef: "N", lng: 0.12, lngRef: "W", taken: "2026:09:12 19:30:00")
    let clean = try Photo.jpeg(from: data, maxEdge: Photo.storedEdge)
    let meta = PhotoMeta.read(clean)
    #expect(meta.lat == nil)
    #expect(meta.date == nil)
  }

  @Test func resizedCopiesHaveNoMetadataAndFitTheStoredEdge() throws {
    let data = try photo(lat: 51.5, latRef: "N", lng: 0.12, lngRef: "W", taken: "2026:09:12 19:30:00")
    let clean = try Photo.resizedJPEG(from: data, maxEdge: Photo.storedEdge)
    let source = try #require(CGImageSourceCreateWithData(clean as CFData, nil))
    let props = try #require(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any])
    #expect(props[kCGImagePropertyGPSDictionary] == nil)
    let exif = props[kCGImagePropertyExifDictionary] as? [CFString: Any]
    #expect(exif?[kCGImagePropertyExifDateTimeOriginal] == nil)
    #expect(PhotoMeta.read(clean) == PhotoMeta())
    let size = try #require(UIImage(data: clean)).size
    #expect(max(size.width, size.height) <= Photo.storedEdge)
  }

  @Test func resizingShrinksBigPhotosAndAppliesOrientation() throws {
    let image = UIGraphicsImageRenderer(size: CGSize(width: 3000, height: 2000)).image { context in
      UIColor.blue.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 3000, height: 2000))
    }
    let data = NSMutableData()
    let dest = try #require(CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil))
    // 6: the camera was held upright, so the pixels need turning.
    CGImageDestinationAddImage(dest, try #require(image.cgImage), [kCGImagePropertyOrientation: 6] as CFDictionary)
    #expect(CGImageDestinationFinalize(dest))
    let out = try Photo.resizedJPEG(from: data as Data, maxEdge: 1000)
    let cg = try #require(UIImage(data: out)?.cgImage)
    #expect(cg.height > cg.width)
    #expect(max(cg.width, cg.height) <= 1000)
  }

  @Test func noExifMeansNothingFound() {
    let image = UIGraphicsImageRenderer(size: CGSize(width: 10, height: 10)).image { _ in }
    #expect(PhotoMeta.read(image.pngData()!) == PhotoMeta())
  }

  @Test func radiusFollowsGpsAccuracyWithinLimits() {
    #expect(PhotoDetect.radius(accuracy: nil) == 150)
    #expect(PhotoDetect.radius(accuracy: 10) == 60)
    #expect(PhotoDetect.radius(accuracy: 40) == 100)
    #expect(PhotoDetect.radius(accuracy: 500) == 150)
  }

  @Test func measuresDistanceInMetres() {
    // Times Square to the Richard Rodgers Theatre: about 175 m.
    let d = PhotoDetect.distance(40.7580, -73.9855, 40.7593, -73.9867)
    #expect(d > 150 && d < 200)
  }
}

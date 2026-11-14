import AVFoundation
import UIKit

@MainActor
enum EntryVideoDerivatives {
  static func make(from file: URL) async throws -> [(String, Data)] {
    let generator = AVAssetImageGenerator(asset: AVURLAsset(url: file))
    generator.maximumSize = CGSize(width: 1024, height: 1024)
    generator.appliesPreferredTrackTransform = true
    let frame = try await generator.image(at: .zero).image
    return try [("poster", 1024), ("thumb", 256)].map { role, limit in
      let edge = min(frame.width, frame.height)
      guard let crop = frame.cropping(to: CGRect(x: (frame.width - edge) / 2,
        y: (frame.height - edge) / 2, width: edge, height: edge)) else { throw CocoaError(.fileReadCorruptFile) }
      let size = CGSize(width: min(edge, limit), height: min(edge, limit))
      let format = UIGraphicsImageRendererFormat()
      format.scale = 1
      let data = UIGraphicsImageRenderer(size: size, format: format).jpegData(withCompressionQuality: 0.8) {
        _ in UIImage(cgImage: crop).draw(in: CGRect(origin: .zero, size: size))
      }
      return (role, try pixelOnlyJPEG(data))
    }
  }
  // UIKit writes EXIF and Photoshop markers even for a freshly drawn image.
  private static func pixelOnlyJPEG(_ data: Data) throws -> Data {
    guard data.starts(with: [0xff, 0xd8]) else { throw CocoaError(.fileReadCorruptFile) }
    var output = Data(data.prefix(2))
    var offset = 2
    while offset + 4 <= data.count, data[offset] == 0xff {
      let marker = data[offset + 1]
      if marker == 0xda {
        output.append(data[offset...])
        return output
      }
      let length = Int(data[offset + 2]) * 256 + Int(data[offset + 3])
      let end = offset + 2 + length
      guard length >= 2, end <= data.count else { break }
      if !(0xe1...0xef).contains(marker), marker != 0xfe {
        output.append(data[offset..<end])
      }
      offset = end
    }
    throw CocoaError(.fileReadCorruptFile)
  }

}

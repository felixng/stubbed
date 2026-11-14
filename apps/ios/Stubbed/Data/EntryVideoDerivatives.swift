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
      return (role, data)
    }
  }
}

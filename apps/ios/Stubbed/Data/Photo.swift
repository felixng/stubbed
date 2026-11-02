import UIKit

/// Photos are resized and re-encoded as JPEG on the device before upload,
/// which drops all EXIF and GPS metadata. Sizes match apps/web/src/lib/photo.ts.
enum Photo {
  static let storedEdge: CGFloat = 1600
  static let avatarEdge: CGFloat = 512

  enum Failure: Error { case unreadable }

  /// Scales the image so its longest edge is at most `maxEdge` (or crops it
  /// to a centred square of that size), and returns fresh JPEG data.
  static func jpeg(from data: Data, maxEdge: CGFloat, quality: CGFloat = 0.85, square: Bool = false) throws -> Data {
    guard let image = UIImage(data: data) else { throw Failure.unreadable }
    return try jpeg(from: image, maxEdge: maxEdge, quality: quality, square: square)
  }

  static func jpeg(from image: UIImage, maxEdge: CGFloat, quality: CGFloat = 0.85, square: Bool = false) throws -> Data {
    let source = image.size
    guard source.width > 0, source.height > 0 else { throw Failure.unreadable }
    let crop = square ? min(source.width, source.height) : 0
    let drawn = square ? CGSize(width: crop, height: crop) : source
    let scale = min(1, maxEdge / max(drawn.width, drawn.height))
    let size = CGSize(width: (drawn.width * scale).rounded(), height: (drawn.height * scale).rounded())

    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let rendered = UIGraphicsImageRenderer(size: size, format: format).image { _ in
      // Draws with the orientation applied, so the JPEG needs no EXIF to
      // display the right way up.
      let width = source.width * scale
      let height = source.height * scale
      image.draw(in: CGRect(x: (size.width - width) / 2, y: (size.height - height) / 2, width: width, height: height))
    }
    guard let jpeg = rendered.jpegData(compressionQuality: quality) else { throw Failure.unreadable }
    return jpeg
  }
}

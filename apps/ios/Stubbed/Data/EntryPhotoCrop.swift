import UIKit

/// A square in pixels of the orientation-normalized JPEG.
struct EntryPhotoCrop: Equatable {
  let origin: CGPoint
  let side: CGFloat

  init(center: CGPoint, side: CGFloat, source: CGSize) {
    self.side = min(max(1, side.rounded()), min(source.width, source.height))
    origin = CGPoint(
      x: min(max(0, (center.x - self.side / 2).rounded()), source.width - self.side),
      y: min(max(0, (center.y - self.side / 2).rounded()), source.height - self.side)
    )
  }

  static func centered(in source: CGSize) -> Self {
    Self(center: CGPoint(x: source.width / 2, y: source.height / 2),
         side: min(source.width, source.height), source: source)
  }

  var center: CGPoint {
    CGPoint(x: origin.x + side / 2, y: origin.y + side / 2)
  }

  func normalized(in source: CGSize) -> [Double] {
    [
      Double(origin.x / source.width), Double(origin.y / source.height),
      Double(side / source.width), Double(side / source.height),
    ]
  }

  func derivatives(from source: CGImage) throws -> (display: Data, thumbnail: Data) {
    guard let cropped = source.cropping(to: CGRect(origin: origin, size: CGSize(width: side, height: side)))
    else { throw Photo.Failure.unreadable }
    let image = UIImage(cgImage: cropped)
    return (
      try Photo.jpeg(from: image, maxEdge: Photo.storedEdge),
      try Photo.jpeg(from: image, maxEdge: 400)
    )
  }
}

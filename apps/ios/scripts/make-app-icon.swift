// Draws the placeholder app icon: the "stubbed" wordmark in white on the
// coral tint (Palette.tint), 1024 × 1024, no transparency (App Store rule).
// `swift scripts/make-app-icon.swift Stubbed/Assets.xcassets/AppIcon.appiconset/AppIcon.png`
import AppKit
import CoreText

let out = URL(fileURLWithPath: CommandLine.arguments[1])
let size = 1024
let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
  space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
ctx.setFillColor(CGColor(srgbRed: 1, green: 0x7A / 255.0, blue: 0x5C / 255.0, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))

let fontSize: CGFloat = 196
let font = NSFont.systemFont(ofSize: fontSize, weight: .heavy)
let text = NSAttributedString(string: "stubbed", attributes: [
  .font: font, .foregroundColor: NSColor.white, .kern: -0.045 * fontSize,
])
let line = CTLineCreateWithAttributedString(text)
let bounds = CTLineGetBoundsWithOptions(line, .useGlyphPathBounds)
ctx.textPosition = CGPoint(
  x: (CGFloat(size) - bounds.width) / 2 - bounds.minX, y: (CGFloat(size) - bounds.height) / 2 - bounds.minY)
CTLineDraw(line, ctx)

let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
try! rep.representation(using: .png, properties: [:])!.write(to: out)
print("Wrote \(out.path)")

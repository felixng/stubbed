import CoreImage
import Foundation
import Testing
import UIKit
import Vision

/// Spike for #279: how well does Apple's free on-device text recognition read
/// theatre paper (programme, Playbill, ticket, poster)? Not part of the normal
/// run. Start it with:
///
///     TEST_RUNNER_SPIKE=1 TEST_RUNNER_SPIKE_OUT=$PWD/build/spike.txt \
///       xcodebuild test-without-building … -only-testing:StubbedTests/PhotoTextSpikeTests
///
/// (`scripts/dev test` stops xcodebuild too early for this one.) It writes
/// `SPIKE|…` lines to SPIKE_OUT. The images are synthetic: text
/// drawn with known content in several fonts, then tilted, dimmed or blurred,
/// so the numbers are a best case for clean print. For real photos, put them
/// in a folder (for example the git-ignored `apps/ios/build/spike-photos/`),
/// named `kind--Show Title--YYYY-MM-DD.jpg` (kind: programme, playbill,
/// ticket or poster; the date is optional), and add
/// `TEST_RUNNER_SPIKE_PHOTOS=<folder>` to the command. They are scored the
/// same way, as "REAL" rows. The catalogue is the 40 titles below, so add the
/// shows in your photos to it first.
@Suite(.serialized)
struct PhotoTextSpikeTests {
  /// Appends to the file named by SPIKE_OUT (the Simulator shares the Mac's
  /// file system), since test output from a cloned Simulator isn't shown.
  static func out(_ line: String) {
    guard let path = ProcessInfo.processInfo.environment["SPIKE_OUT"] else { return print(line) }
    if let handle = FileHandle(forWritingAtPath: path) {
      handle.seekToEndOfFile()
      handle.write(Data((line + "\n").utf8))
      try? handle.close()
    } else {
      FileManager.default.createFile(atPath: path, contents: Data((line + "\n").utf8))
    }
  }

  struct Case {
    let kind: String
    let title: String
    let lines: [(text: String, font: UIFont, size: CGFloat)]
    let expectedDay: String?
  }

  static let catalogue = [
    "Hadestown", "Operation Mincemeat", "The Lion King", "Hamilton", "Les Misérables", "Wicked",
    "Six", "MJ the Musical", "Come From Away", "Back to the Future", "Mamma Mia!", "Chicago",
    "The Phantom of the Opera", "Book of Mormon", "Matilda the Musical", "Dear Evan Hansen",
    "Harry Potter and the Cursed Child", "Moulin Rouge! The Musical", "& Juliet", "Cabaret",
    "Oh, Mary!", "Stranger Things: The First Shadow", "Sunset Boulevard", "Kimberly Akimbo",
    "Hell's Kitchen", "The Outsiders", "Suffs", "Merrily We Roll Along", "Death of a Salesman",
    "Othello", "Hamlet", "A Streetcar Named Desire", "The Mousetrap", "Les Mis",
    "Water for Elephants", "Maybe Happy Ending", "Just in Time", "Buena Vista Social Club",
    "Dog Day Afternoon", "The Great Gatsby",
  ]

  static func font(_ name: String, _ size: CGFloat) -> UIFont { UIFont(name: name, size: size) ?? .systemFont(ofSize: size) }

  static var cases: [Case] {
    let h = { (s: CGFloat) in font("HelveticaNeue-Bold", s) }
    let g = { (s: CGFloat) in font("Georgia-BoldItalic", s) }
    let c = { (s: CGFloat) in font("Courier", s) }
    let f = { (s: CGFloat) in font("Futura-CondensedExtraBold", s) }
    return [
      Case(kind: "programme", title: "Hadestown", lines: [("HADESTOWN", h(120), 120), ("Walter Kerr Theatre", h(44), 44)], expectedDay: nil),
      Case(kind: "programme", title: "Operation Mincemeat", lines: [("OPERATION", f(110), 110), ("MINCEMEAT", f(110), 110), ("A New Musical Comedy", g(40), 40)], expectedDay: nil),
      Case(kind: "programme", title: "The Lion King", lines: [("THE LION KING", g(96), 96), ("Lyceum Theatre", h(40), 40)], expectedDay: nil),
      Case(kind: "playbill", title: "Hamilton", lines: [("PLAYBILL", h(44), 44), ("Richard Rodgers Theatre", h(36), 36), ("Hamilton", g(130), 130), ("An American Musical", g(40), 40)], expectedDay: nil),
      Case(kind: "playbill", title: "Wicked", lines: [("PLAYBILL", h(44), 44), ("Gershwin Theatre", h(36), 36), ("WICKED", f(150), 150)], expectedDay: nil),
      Case(kind: "playbill", title: "Come From Away", lines: [("PLAYBILL", h(44), 44), ("Come From Away", g(100), 100), ("Schoenfeld Theatre", h(36), 36)], expectedDay: nil),
      Case(kind: "ticket", title: "Operation Mincemeat", lines: [("OPERATION MINCEMEAT", c(46), 46), ("Fortune Theatre", c(34), 34), ("Sat 3 Oct 2026 7.30pm", c(34), 34), ("STALLS ROW F SEAT 12", c(30), 30)], expectedDay: "2026-10-03"),
      Case(kind: "ticket", title: "Six", lines: [("SIX", c(70), 70), ("Vaudeville Theatre", c(34), 34), ("14 September 2026 - 19:30", c(34), 34), ("Dress Circle B14", c(30), 30)], expectedDay: "2026-09-14"),
      Case(kind: "ticket", title: "Hamilton", lines: [("HAMILTON - Premium Orchestra", c(44), 44), ("Richard Rodgers Theatre", c(34), 34), ("Fri, Aug 21, 2026 8:00 PM", c(34), 34), ("ORCH Row C Seat 101", c(30), 30)], expectedDay: "2026-08-21"),
      Case(kind: "ticket", title: "Chicago", lines: [("CHICAGO", c(70), 70), ("Ambassador Theatre", c(34), 34), ("03/10/2026  19:30", c(34), 34)], expectedDay: "2026-10-03"),
      Case(kind: "poster", title: "Les Misérables", lines: [("LES MISÉRABLES", g(96), 96), ("The Original West End Cast", h(36), 36), ("Sondheim Theatre", h(40), 40)], expectedDay: nil),
      Case(kind: "poster", title: "The Phantom of the Opera", lines: [("THE PHANTOM", f(130), 130), ("OF THE OPERA", f(130), 130), ("Majestic Theatre", h(36), 36)], expectedDay: nil),
      Case(kind: "poster", title: "Matilda the Musical", lines: [("Matilda", g(150), 150), ("THE MUSICAL", h(60), 60)], expectedDay: nil),
    ]
  }

  enum Variant: String, CaseIterable { case clean, tilted, dim, blurred }

  static func render(_ c: Case, _ variant: Variant) -> UIImage {
    let size = CGSize(width: 1200, height: 1600)
    let dark = c.kind == "programme" || c.kind == "poster"
    let base = UIGraphicsImageRenderer(size: size).image { ctx in
      (dark ? UIColor(red: 0.12, green: 0.08, blue: 0.16, alpha: 1) : UIColor(white: 0.96, alpha: 1)).setFill()
      ctx.fill(CGRect(origin: .zero, size: size))
      var y: CGFloat = 220
      for line in c.lines {
        let style = NSMutableParagraphStyle()
        style.alignment = .center
        let attrs: [NSAttributedString.Key: Any] = [
          .font: line.font, .foregroundColor: dark ? UIColor.white : UIColor.black, .paragraphStyle: style,
        ]
        let rect = CGRect(x: 60, y: y, width: size.width - 120, height: line.size * 1.5)
        NSAttributedString(string: line.text, attributes: attrs).draw(in: rect)
        y += line.size * 1.6
      }
    }
    switch variant {
    case .clean: return base
    case .tilted:
      return UIGraphicsImageRenderer(size: size).image { ctx in
        UIColor.gray.setFill()
        ctx.fill(CGRect(origin: .zero, size: size))
        ctx.cgContext.translateBy(x: size.width / 2, y: size.height / 2)
        ctx.cgContext.rotate(by: 4 * .pi / 180)
        base.draw(in: CGRect(x: -size.width / 2, y: -size.height / 2, width: size.width, height: size.height))
      }
    case .dim:
      return UIGraphicsImageRenderer(size: size).image { ctx in
        base.draw(at: .zero)
        UIColor(white: 0, alpha: 0.55).setFill()
        ctx.fill(CGRect(origin: .zero, size: size), blendMode: .normal)
      }
    case .blurred:
      let filter = CIFilter(name: "CIGaussianBlur")!
      filter.setValue(CIImage(image: base), forKey: kCIInputImageKey)
      // The renderer draws at device scale (3x), so this is about 1.3 points.
      filter.setValue(4.0, forKey: kCIInputRadiusKey)
      let source = CIImage(image: base)!
      let out = filter.outputImage!.cropped(to: source.extent)
      return UIImage(cgImage: CIContext().createCGImage(out, from: source.extent)!)
    }
  }

  static func read(_ image: CGImage) throws -> (lines: [String], ms: Double) {
    let started = Date()
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["en-GB", "en-US"]
    try VNImageRequestHandler(cgImage: image).perform([request])
    let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    return (lines, Date().timeIntervalSince(started) * 1000)
  }

  static func norm(_ s: String) -> String {
    let folded = s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .init(identifier: "en"))
    let words = folded.lowercased().split { !$0.isLetter && !$0.isNumber }.filter { $0 != "the" }
    return words.joined(separator: " ")
  }

  static func trigrams(_ s: String) -> Set<String> {
    let p = "  " + s + " "
    return Set((0..<max(0, p.count - 2)).map { i in String(p.dropFirst(i).prefix(3)) })
  }

  /// Best score of each catalogue title against any line or pair of adjacent
  /// lines: a stand-in for the server's `search_shows`.
  static func rank(_ lines: [String]) -> [String] {
    var pieces = lines
    for i in 0..<max(0, lines.count - 1) { pieces.append(lines[i] + " " + lines[i + 1]) }
    let normed = pieces.map(norm).filter { $0.count >= 2 }
    var scored: [(String, Double)] = []
    for title in catalogue {
      let t = norm(title)
      let tg = trigrams(t)
      var best = 0.0
      for p in normed {
        var s: Double
        if p == t { s = 1 } else if p.contains(t) && t.count >= 4 { s = 0.9 } else {
          let pg = trigrams(p)
          s = Double(tg.intersection(pg).count) / Double(max(1, tg.union(pg).count))
        }
        best = max(best, s)
      }
      scored.append((title, best))
    }
    return scored.sorted { $0.1 > $1.1 }.filter { $0.1 > 0.3 }.prefix(3).map(\.0)
  }

  static func dates(_ lines: [String]) -> [String] {
    let detector = try! NSDataDetector(types: NSTextCheckingResult.CheckingType.date.rawValue)
    let text = lines.joined(separator: "\n")
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .current
    return detector.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap { $0.date }.map {
      let c = calendar.dateComponents([.year, .month, .day], from: $0)
      return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
  }

  @Test(.enabled(if: ProcessInfo.processInfo.environment["SPIKE"] != nil))
  func visionOnTheatrePaper() throws {
    struct Row { let kind, variant, title: String; let top1, top3: Bool; let dateOK: Bool?; let ms: Double; let top: [String] }
    var rows: [Row] = []
    for c in Self.cases {
      for v in Variant.allCases {
        let image = try #require(Self.render(c, v).cgImage)
        let (lines, ms) = try Self.read(image)
        let top = Self.rank(lines)
        let dateOK = c.expectedDay.map { Self.dates(lines).contains($0) }
        rows.append(Row(kind: c.kind, variant: v.rawValue, title: c.title, top1: top.first == c.title, top3: top.contains(c.title), dateOK: dateOK, ms: ms, top: top))
        Self.out("SPIKE|case|\(c.kind)|\(v.rawValue)|\(c.title)|top=\(top)|dates=\(Self.dates(lines))|lines=\(lines.prefix(6))")
      }
    }
    // Real photos, when the owner has dropped some in.
    let dir = URL(fileURLWithPath: ProcessInfo.processInfo.environment["SPIKE_PHOTOS"] ?? "/nonexistent")
    for url in (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? [] where url.pathExtension.lowercased() == "jpg" {
      let parts = url.deletingPathExtension().lastPathComponent.components(separatedBy: "--")
      guard parts.count >= 2, let image = UIImage(contentsOfFile: url.path)?.cgImage else { continue }
      let (lines, ms) = try Self.read(image)
      let top = Self.rank(lines)
      let day = parts.count > 2 ? parts[2] : nil
      rows.append(Row(kind: "REAL " + parts[0], variant: "photo", title: parts[1], top1: top.first == parts[1], top3: top.contains(parts[1]), dateOK: day.map { Self.dates(lines).contains($0) }, ms: ms, top: top))
    }
    for kind in Array(Set(rows.map(\.kind))).sorted() {
      for variant in ["all"] + Variant.allCases.map(\.rawValue) + ["photo"] {
        let group = rows.filter { $0.kind == kind && (variant == "all" || $0.variant == variant) }
        guard !group.isEmpty else { continue }
        let dated = group.compactMap(\.dateOK)
        let pct = { (n: Int, d: Int) in d == 0 ? "n/a" : "\(n)/\(d)" }
        Self.out("SPIKE|table|\(kind)|\(variant)|n=\(group.count)|top1=\(pct(group.filter(\.top1).count, group.count))|top3=\(pct(group.filter(\.top3).count, group.count))|date=\(pct(dated.filter { $0 }.count, dated.count))|ms=\(Int(group.map(\.ms).reduce(0, +) / Double(group.count)))")
      }
    }
  }
}

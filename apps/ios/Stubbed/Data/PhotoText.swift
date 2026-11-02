import Foundation
import ImageIO
import Vision

/// Reading a photo of a programme, Playbill, ticket or poster on the device
/// (#280): Apple's text recognition (iOS 17+, offline, nothing uploaded), then
/// matches against the catalogue. The spike's numbers and the rules below are
/// in docs/DECISIONS.md (#279).
enum PhotoText {
  struct Line: Sendable, Equatable {
    let text: String
    /// How tall the text is, as a fraction of the photo: big print is the title.
    let height: Double
  }

  struct Reading: Sendable, Equatable {
    var lines: [Line]

    /// Printed paper (a ticket or programme) rather than a stage photo: it has
    /// a printed date or ticket words. Its text, not the photo's own time and
    /// place, then says when and where the show was seen (#134).
    var isPaper: Bool { PhotoText.isPaper(lines.map(\.text)) }
  }

  /// Large photos are read at this size on the long edge: the same words, in
  /// less than half the time.
  static let maxEdge = 2000

  /// Recognises the text in `data`. Nil when the photo can't be decoded.
  static func read(_ data: Data) async -> Reading? {
    await Task.detached(priority: .utility) { () -> Reading? in
      let options: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: maxEdge,
      ]
      guard
        let source = CGImageSourceCreateWithData(data as CFData, nil),
        let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
      else { return nil }
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      request.recognitionLanguages = ["en-GB", "en-US"]
      do { try VNImageRequestHandler(cgImage: image).perform([request]) } catch { return nil }
      let lines = (request.results ?? []).compactMap { observation -> Line? in
        guard let text = observation.topCandidates(1).first?.string else { return nil }
        return Line(text: text, height: Double(observation.boundingBox.height))
      }
      return Reading(lines: lines)
    }.value
  }

  // MARK: - Words

  /// Lower case, no accents, no punctuation, no "the": how titles are compared.
  static func normalise(_ text: String) -> String {
    text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en"))
      .lowercased()
      .split { !$0.isLetter && !$0.isNumber }
      .filter { $0 != "the" }
      .joined(separator: " ")
  }

  private static let ticketWords: Set<String> = [
    "row", "seat", "seats", "stalls", "circle", "balcony", "mezzanine", "orchestra", "admit", "ticket", "tickets",
    "gate", "door", "doors", "playbill", "programme", "program", "price", "total",
  ]

  /// Words that sit next to a title on paper without being part of it.
  private static let noise: Set<String> = ticketWords.union([
    "theatre", "theater", "grand", "dress", "upper", "royal", "box", "office", "presents", "musical", "new",
    "www", "com", "tax", "fee", "booking", "order", "ref", "date", "time", "pm", "am",
  ])

  private static func isPaper(_ lines: [String]) -> Bool {
    if printedDate(in: lines, country: nil, allowAmbiguous: true) != nil { return true }
    let words = Set(lines.flatMap { normalise($0).split(separator: " ").map(String.init) })
    return words.intersection(ticketWords).count >= 2
  }

  // MARK: - Printed date

  private static let numeric = try! NSRegularExpression(pattern: #"(?<!\d)(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?!\d)"#)
  private static let monthName = try! NSRegularExpression(
    pattern: #"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b"#, options: .caseInsensitive)
  private static let year = try! NSRegularExpression(pattern: #"\b(19|20)\d{2}\b"#)
  private static let detector = try! NSDataDetector(types: NSTextCheckingResult.CheckingType.date.rawValue)

  private static func matches(_ regex: NSRegularExpression, in text: String) -> Bool {
    regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
  }

  /// A date printed on the paper, as `YYYY-MM-DD`.
  ///
  /// - A bare time such as "19:30" is not a date (the system's date finder
  ///   returns today for one), so a date needs a month name and a year, or
  ///   day, month and year as numbers.
  /// - "03/10/2026" is day-first except in the US. With no country and no
  ///   way to tell (both parts 12 or under), there is no date.
  static func printedDate(in lines: [String], country: String?, allowAmbiguous: Bool = false) -> String? {
    let text = lines.joined(separator: " ")
    let whole = NSRange(text.startIndex..., in: text)
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .current

    for m in numeric.matches(in: text, range: whole) {
      func part(_ i: Int) -> Int { Int((text as NSString).substring(with: m.range(at: i))) ?? 0 }
      let (a, b, y) = (part(1), part(2), part(3))
      let day: Int
      let month: Int
      if a > 12 {
        (day, month) = (a, b)
      } else if b > 12 {
        (day, month) = (b, a)
      } else if a == b {
        (day, month) = (a, b)
      } else if let country {
        (day, month) = country.uppercased() == "US" ? (b, a) : (a, b)
      } else if allowAmbiguous {
        (day, month) = (a, b)
      } else {
        continue
      }
      if let date = calendar.date(from: DateComponents(year: y, month: month, day: day)),
        calendar.component(.day, from: date) == day, calendar.component(.month, from: date) == month
      {
        return Day.string(date)
      }
    }

    for m in detector.matches(in: text, range: whole) {
      guard let date = m.date, let range = Range(m.range, in: text) else { continue }
      let found = String(text[range])
      guard matches(monthName, in: found), matches(year, in: found) else { continue }
      return Day.string(date)
    }
    return nil
  }

  // MARK: - Titles

  /// The pieces of printed text worth looking up as a show title: each line
  /// and each pair of adjacent lines (a title can wrap), biggest print first.
  /// Venue names, seat details and other paper words are left out.
  static func titleCandidates(_ lines: [Line], limit: Int = 5) -> [String] {
    var pieces = lines.map { ($0.text, $0.height) }
    for i in 0..<max(0, lines.count - 1) {
      pieces.append((lines[i].text + " " + lines[i + 1].text, max(lines[i].height, lines[i + 1].height)))
    }
    var seen = Set<String>()
    return pieces
      .filter { text, _ in
        let words = normalise(text).split(separator: " ").map(String.init)
        guard normalise(text).count >= 3, !words.isEmpty else { return false }
        // A row or seat letter ("ROW F") counts as paper too.
        if words.allSatisfy({ noise.contains($0) || $0.count == 1 || $0.allSatisfy(\.isNumber) }) { return false }
        // A venue line, a date or a time isn't a title.
        if words.contains("theatre") || words.contains("theater") { return false }
        if text.contains(":") && text.contains(where: \.isNumber) { return false }
        return !words.contains { $0.count >= 4 && $0.allSatisfy(\.isNumber) }
      }
      .sorted { $0.1 > $1.1 }
      .map(\.0)
      .filter { seen.insert(normalise($0)).inserted }
      .prefix(limit)
      .map { $0 }
  }

  /// Whether a catalogue title is what the printed text says.
  static func isMatch(piece: String, title: String) -> Bool {
    let p = normalise(piece)
    let t = normalise(title)
    guard t.count >= 2 else { return false }
    if p == t { return true }
    // "OPERATION MINCEMEAT A New Musical Comedy" contains the title; a
    // three-letter title like "Six" only counts when it stands alone.
    return t.count >= 4 && " \(p) ".contains(" \(t) ")
  }

  struct ShowMatches: Sendable, Equatable {
    /// Exactly one show matched: fill it in.
    var confident: Show?
    /// Several matched: offer them.
    var suggestions: [Show] = []
  }

  /// Looks the candidates up in the catalogue (the only step that needs the
  /// network). Nothing found, or offline: empty.
  static func matchShows(_ reading: Reading) async -> ShowMatches {
    let candidates = titleCandidates(reading.lines)
    let results = await withTaskGroup(of: (Int, [Show]).self) { group in
      for (i, piece) in candidates.enumerated() {
        group.addTask { (i, (try? await Entries.searchShows(piece))?.filter { isMatch(piece: piece, title: $0.title) } ?? []) }
      }
      var all: [(Int, [Show])] = []
      for await r in group { all.append(r) }
      return all.sorted { $0.0 < $1.0 }
    }
    var shows: [Show] = []
    for show in results.flatMap(\.1) where !shows.contains(where: { $0.id == show.id }) { shows.append(show) }
    return ShowMatches(confident: shows.count == 1 ? shows[0] : nil, suggestions: shows.count > 1 ? Array(shows.prefix(3)) : [])
  }

  // MARK: - Venue

  /// A line that names a theatre, matched to a saved venue by name.
  static func matchVenue(_ reading: Reading) async -> Venue? {
    func key(_ s: String) -> String { normalise(s).replacingOccurrences(of: "theater", with: "theatre") }
    let names = reading.lines.map(\.text).filter { key($0).contains("theatre") || key($0).contains("playhouse") }
    for name in names.prefix(3) {
      if let found = (try? await Entries.searchVenues(name))?.first(where: { key($0.name) == key(name) }) { return found }
    }
    return nil
  }
}

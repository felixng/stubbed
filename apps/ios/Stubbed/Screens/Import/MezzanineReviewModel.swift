import Foundation
import Observation

@MainActor @Observable
final class MezzanineReviewModel {
  let url: URL?
  let started = Date()
  var rows: [MezzanineDraft] = []
  var parsed: [MezzanineRow]?
  var busy = false
  var progress = "Reading your file…"
  var error: String?
  var visibility = Visibility.public
  var added = 0
  var finished = false
  var retryable = false
  var saving = false
  var stopRequested = false
  var matchingStopped = false
  var stopped = false
  var lastCountry: String?
  var countryNotice: String?

  var ready: [MezzanineDraft] { rows.filter { !$0.saved && !$0.duplicate && $0.missing.isEmpty && $0.error == nil } }
  var needsAttention: [MezzanineDraft] { rows.filter { !$0.saved && !$0.duplicate && (!$0.missing.isEmpty || $0.error != nil) } }
  var duplicates: [MezzanineDraft] { rows.filter { !$0.saved && $0.duplicate } }
  var remaining: Int { rows.filter { !$0.saved && !$0.duplicate }.count }
  var resultTitle: String { added == 0 ? "No shows added to your diary" : "\(added) \(added == 1 ? "show" : "shows") added to your diary" }
  var resultDetails: String {
    var details: [String] = []
    if stopped && remaining > 0 { details.append("\(remaining) left") }
    else {
      if !needsAttention.isEmpty { details.append("\(needsAttention.count) to fix") }
      let skipped = ready.count
      if skipped > 0 { details.append("\(skipped) not imported") }
    }
    if !duplicates.isEmpty { details.append("\(duplicates.count) already in your diary") }
    return details.joined(separator: " · ")
  }

  func selectReady(_ selected: Bool) {
    let ids = Set(ready.map(\.id))
    for i in rows.indices where ids.contains(rows[i].id) { rows[i].selected = selected }
  }

  func requestStop() {
    stopRequested = true
    progress = saving ? "Stopping after this show…" : "Stopping after the current matches…"
  }

  init(url: URL? = nil) { self.url = url }
  var selected: Int { rows.filter { $0.selected && !$0.saved && $0.missing.isEmpty }.count }
  var cities: [String] {
    var cities: [String: String] = [:]
    for row in rows where !row.saved && row.venue.id == nil && (row.venue.country ?? "").isEmpty {
      if let city = row.venue.city, !city.isEmpty { cities[MezzanineResolver.normalise(city)] = city }
    }
    return cities.values.sorted()
  }

  func load(userId: UUID) async {
    guard !busy else { return }
    busy = true; saving = false; stopRequested = false; matchingStopped = false; error = nil; retryable = false
    defer { busy = false }
    do {
      if parsed == nil, let url {
        parsed = try await Task.detached {
          let access = url.startAccessingSecurityScopedResource()
          defer { if access { url.stopAccessingSecurityScopedResource() } }
          let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize
          if let size { try MezzanineImport.checkFileSize(size) }
          let data = try Data(contentsOf: url, options: .mappedIfSafe)
          try MezzanineImport.checkFileSize(data.count)
          guard let text = String(data: data, encoding: .utf8) else { throw MezzanineImport.Failure.unsupported }
          return try MezzanineImport.parse(text)
        }.value
      }
      guard let parsed else { return }
      visibility = try await Entries.formContext(userId: userId).visibility
      rows = try await MezzanineResolver.resolve(parsed, userId: userId, before: started, progress: { done, total in
        if !self.stopRequested { self.progress = "Matching shows and theatres: \(done) of \(total)" }
      }, shouldStop: { self.stopRequested })
    } catch is MezzanineResolver.Stopped {
      matchingStopped = true; progress = "Matching stopped. Your file is kept."
    } catch let failure as MezzanineImport.Failure {
      error = failure.localizedDescription
    } catch is CancellationError { }
    catch {
      retryable = true
      self.error = "Couldn’t match your shows. Check your connection and try again. Your file is kept."
    }
  }

  func applyCountry(_ country: String, city: String) {
    let key = MezzanineResolver.normalise(city)
    var updated = 0
    lastCountry = country
    for i in rows.indices where !rows[i].saved && rows[i].venue.id == nil
      && MezzanineResolver.normalise(rows[i].venue.city ?? "") == key {
      updated += 1
      rows[i].venue.country = country
      rows[i].selected = rows[i].missing.isEmpty && !rows[i].duplicate
    }
    let name = Locale.current.localizedString(forRegionCode: country) ?? country
    countryNotice = "\(name) applied to \(updated) \(updated == 1 ? "show" : "shows") in \(city)."
  }

  func save(userId: UUID, write: @MainActor (Entries.Draft, UUID) async throws -> Void = { draft, userId in
    _ = try await Entries.save(draft, userId: userId, editing: nil)
    Analytics.track(.entryLogged, ["method": .string("mezzanine")])
  }) async {
    guard !busy else { return }
    busy = true; saving = true; stopRequested = false; stopped = false; finished = false
    defer { busy = false; saving = false }
    let ids = rows.filter { $0.selected && !$0.saved && $0.missing.isEmpty }.map(\.id)
    var cities: [String: String] = [:]
    var attempted = 0
    for (offset, id) in ids.enumerated() {
      if stopRequested { break }
      guard let i = rows.firstIndex(where: { $0.id == id }), let date = rows[i].source.date else { continue }
      progress = "Importing \(offset + 1) of \(ids.count)"
      rows[i].error = nil
      let row = rows[i]
      do {
        var venue = row.venue
        if venue.id == nil, let city = venue.city, let country = venue.country {
          let key = MezzanineResolver.normalise(city) + "\u{1f}" + country
          if cities[key] == nil { cities[key] = try await Entries.canonicalCity(city, country: country) }
          venue.city = cities[key]
        }
        try await write(Entries.Draft(id: row.id, show: row.show, venue: venue,
          date: date, rating: row.source.rating, note: row.source.review, visibility: visibility,
          tripIds: [], photo: nil, keepPhoto: false), userId)
        rows[i].saved = true; rows[i].selected = false; added += 1
      } catch { rows[i].error = "Couldn’t save this show. Check your connection and try again." }
      attempted += 1
    }
    stopped = stopRequested && attempted < ids.count
    finished = true
  }
}

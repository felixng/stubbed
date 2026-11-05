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
    busy = true; error = nil
    defer { busy = false }
    do {
      if parsed == nil, let url {
        parsed = try await Task.detached {
          let access = url.startAccessingSecurityScopedResource()
          defer { if access { url.stopAccessingSecurityScopedResource() } }
          let data = try Data(contentsOf: url)
          guard let text = String(data: data, encoding: .utf8) else { throw MezzanineImport.Failure.unsupported }
          return try MezzanineImport.parse(text)
        }.value
      }
      guard let parsed else { return }
      visibility = try await Entries.formContext(userId: userId).visibility
      rows = try await MezzanineResolver.resolve(parsed, userId: userId, before: started) { done, total in
        self.progress = "Matching shows and theatres: \(done) of \(total)"
      }
    } catch is CancellationError { }
    catch { self.error = "\(error.localizedDescription) Your file is kept so you can try again." }
  }

  func applyCountry(_ country: String, city: String) {
    let key = MezzanineResolver.normalise(city)
    for i in rows.indices where !rows[i].saved && rows[i].venue.id == nil
      && MezzanineResolver.normalise(rows[i].venue.city ?? "") == key {
      rows[i].venue.country = country
      rows[i].selected = rows[i].missing.isEmpty && !rows[i].duplicate
    }
  }

  func save(userId: UUID) async {
    guard !busy else { return }
    busy = true; finished = false
    defer { busy = false }
    let ids = rows.filter { $0.selected && !$0.saved && $0.missing.isEmpty }.map(\.id)
    var cities: [String: String] = [:]
    for (offset, id) in ids.enumerated() {
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
        _ = try await Entries.save(Entries.Draft(id: row.id, show: row.show, venue: venue,
          date: date, rating: row.source.rating, note: row.source.review, visibility: visibility,
          tripIds: [], photo: nil, keepPhoto: false), userId: userId, editing: nil)
        rows[i].saved = true; rows[i].selected = false; added += 1
        Analytics.track(.entryLogged, ["method": .string("mezzanine")])
      } catch { rows[i].error = error.localizedDescription }
    }
    finished = true
  }
}

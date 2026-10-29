import Testing
@testable import Stubbed

/// The web's groupPhotos rule (apps/web/src/lib/import/drafts.ts), ported.
struct PhotoImportTests {
  private struct Shot {
    let name: String
    let meta: PhotoMeta
    init(_ name: String, _ date: String?, _ time: String?, _ lat: Double? = nil, _ lng: Double? = nil) {
      self.name = name
      meta = PhotoMeta(date: date, time: time, lat: lat, lng: lng)
    }
  }

  private func names(_ shots: [Shot]) -> [[String]] {
    PhotoImport.group(shots, meta: \.meta).map { $0.map(\.name) }
  }

  @Test func groupsAnEveningAtOneTheatre() {
    let shots = [
      Shot("curtain", "2026-10-03", "22:31", 40.75935, -73.98680),
      Shot("set", "2026-10-03", "19:40", 40.75940, -73.98690),
      Shot("playbill", "2026-10-03", "19:45"),
    ]
    #expect(names(shots) == [["set", "playbill", "curtain"]])
  }

  @Test func splitsByDayTimeAndPlace() {
    let shots = [
      Shot("matinee", "2026-10-03", "14:00", 40.75935, -73.98680),
      Shot("evening", "2026-10-03", "19:30", 40.75935, -73.98680),
      Shot("across town", "2026-10-03", "20:00", 40.7725, -73.9835),
      Shot("next day", "2026-10-04", "19:30", 40.75935, -73.98680),
    ]
    #expect(names(shots) == [["matinee"], ["evening"], ["across town"], ["next day"]])
  }

  @Test func undatedPhotosStayAloneAndComeLast() {
    let shots = [Shot("a", nil, nil), Shot("b", "2026-09-14", "19:30"), Shot("c", nil, nil)]
    #expect(names(shots) == [["b"], ["a"], ["c"]])
  }

  @Test func aChainOfShotsCantDriftDownTheStreet() {
    // Each shot is ~180 m from the last, but the third is ~360 m from the first.
    let shots = [
      Shot("1", "2026-10-03", "19:00", 40.7590, -73.9850),
      Shot("2", "2026-10-03", "19:10", 40.7606, -73.9850),
      Shot("3", "2026-10-03", "19:20", 40.7622, -73.9850),
    ]
    #expect(names(shots) == [["1", "2"], ["3"]])
  }

  @Test func twentyPhotosFromSixNights() {
    let theatres = [(40.7593, -73.9868), (51.5115, -0.1281), (40.7590, -73.9845)]
    var shots: [Shot] = []
    for visit in 0..<6 {
      let (lat, lng) = theatres[visit % 3]
      for i in 0..<(visit < 2 ? 4 : 3) {
        shots.append(Shot("\(visit)-\(i)", "2026-0\(visit + 1)-10", "19:\(10 + i * 10)", lat, lng))
      }
    }
    #expect(shots.count == 20)
    #expect(names(shots.reversed()).map { $0.count } == [4, 4, 3, 3, 3, 3])
  }
}

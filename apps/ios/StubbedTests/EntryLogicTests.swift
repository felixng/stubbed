import Foundation
import Testing
@testable import Stubbed

struct EntryLogicTests {
  @Test func readsStandUpAndUnknownShowTypes() throws {
    func show(_ type: String) throws -> Show {
      let json = #"{"id":"00000000-0000-4000-a000-000000000001","title":"Set","type":"\#(type)"}"#
      return try JSONDecoder().decode(Show.self, from: Data(json.utf8))
    }
    #expect(try show("standup").type == .standup)
    #expect(ShowType.standup.label == "Stand-up")
    // A type added after this build reads as Other instead of failing the list.
    #expect(try show("circus").type == .other)
  }

  @Test func readsSimilarShowsAndVenues() throws {
    let shows = #"[{"id":"00000000-0000-4000-a000-000000000001","title":"Les Misérables","type":"musical","same":true}]"#
    let show = try JSONDecoder().decode([Entries.Similar<Show>].self, from: Data(shows.utf8))
    #expect(show.first?.item.title == "Les Misérables")
    #expect(show.first?.same == true)

    let venues = #"""
      [{"id":"00000000-0000-4000-a000-000000000002","name":"Wyndham's Theatre","city":"London","country":"GB",
        "lat":51.5,"lng":-0.12,"osm_id":null,"distance_km":0.01,"same":false}]
      """#
    let venue = try JSONDecoder().decode([Entries.Similar<Venue>].self, from: Data(venues.utf8))
    #expect(venue.first?.item.name == "Wyndham's Theatre")
    #expect(venue.first?.same == false)
  }

  @Test func formatsDaysLikeTheWeb() {
    #expect(Day.format("2026-10-08") == "8 Oct 2026")
    #expect(Day.formatLong("2026-10-08") == "Thursday 8 October 2026")
    #expect(Day.formatRange("2026-10-04", "2026-10-08") == "4 Oct – 8 Oct 2026")
    #expect(Day.formatRange("2026-12-28", "2027-01-03") == "28 Dec 2026 – 3 Jan 2027")
    #expect(Day.formatRange("2026-10-08", "2026-10-08") == "8 Oct 2026")
  }

  @Test func futureDaysArePlanned() {
    #expect(Day.status("2026-10-15", today: "2026-10-14") == .planned)
    #expect(Day.status("2026-10-14", today: "2026-10-14") == .logged)
    #expect(Day.status("2025-01-01", today: "2026-10-14") == .logged)
  }

  @Test func roundTripsDaysThroughDates() {
    #expect(Day.string(Day.date("2026-02-28")) == "2026-02-28")
  }

  @Test func tripsCoverTheirOwnDates() {
    let trip = Trip(id: UUID(), name: "NYC", startDate: "2026-10-04", endDate: "2026-10-08")
    #expect(trip.covers("2026-10-04"))
    #expect(trip.covers("2026-10-08"))
    #expect(!trip.covers("2026-10-09"))
  }

  @Test func ratingStepsByHalfStarsAcrossTheWidth() {
    #expect(RatingInput.rating(at: 0, width: 180) == 0.5)
    #expect(RatingInput.rating(at: 18, width: 180) == 0.5)
    #expect(RatingInput.rating(at: 19, width: 180) == 1)
    #expect(RatingInput.rating(at: 120, width: 180) == 3.5)
    #expect(RatingInput.rating(at: 500, width: 180) == 5)
    #expect(RatingInput.label(nil) == "No rating")
    #expect(RatingInput.label(1) == "1 star")
    #expect(RatingInput.label(3.5) == "3.5 stars")
  }
}

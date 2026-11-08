import Foundation
import Testing

@testable import Stubbed

struct ShowSuggestionsTests {
  private let venue = UUID()
  private func row(_ n: Int, _ source: String = "community") -> ShowSuggestion {
    ShowSuggestion(showId: UUID(uuidString: "00000000-0000-0000-0000-00000000000\(n)"), title: "Show \(n)", venueId: venue, source: source, score: 1)
  }

  @Test func capsEachSourceAtThreeAndDedupes() {
    let rows = [row(1), row(2), row(3), row(4), row(1), row(5, "yours"), row(1, "yours")]
    let out = ShowSuggestions.normalise(rows).map { "\($0.source):\($0.title)" }
    #expect(out == ["community:Show 1", "community:Show 2", "community:Show 3", "yours:Show 5"])
  }

  @Test func timeoutAndFailureGiveNoChips() async {
    struct Boom: Error {}
    let slow = await ShowSuggestions.load(timeout: .milliseconds(30)) {
      try await Task.sleep(for: .seconds(5))
      return [row(1)]
    }
    #expect(slow.isEmpty)
    let failed = await ShowSuggestions.load { throw Boom() }
    #expect(failed.isEmpty)
    let empty = await ShowSuggestions.load { [] }
    #expect(empty.isEmpty)
  }

  @Test func quickResponseIsReturned() async {
    let out = await ShowSuggestions.load { [row(1)] }
    #expect(out.count == 1)
  }
}

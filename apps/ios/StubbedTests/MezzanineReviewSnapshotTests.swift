import SwiftUI
import XCTest
@testable import Stubbed

/// Exercise the actual review at small/large sizes without a login or a file-picker shortcut.
@MainActor
final class MezzanineReviewSnapshotTests: XCTestCase {
  private func model() -> MezzanineReviewModel {
    let model = MezzanineReviewModel()
    func row(_ title: String, _ city: String, country: String?, date: String? = "2026-10-01") -> MezzanineDraft {
      MezzanineDraft(id: UUID(), source: MezzanineRow(show: title, venue: "Example Theatre", city: city,
        date: date, rating: 4.5, review: "Public review", invalidRating: false, planned: false),
        show: ShowChoice(newTitle: title), venue: VenueChoice(name: "Example Theatre", city: city, country: country))
    }
    model.rows = [row("Synthetic Musical", "Test City", country: "GB"),
                  row("Another Show", "Example City", country: nil),
                  row("An Earlier Visit", "Test City", country: "GB")]
    model.rows[0].selected = true
    model.rows[2].duplicate = true
    return model
  }

  private func capture<V: View>(_ view: V, name: String, size: CGSize, dark: Bool = false,
                                type: DynamicTypeSize = .large) async throws {
    let previous = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows).first(where: \.isKeyWindow)
    let scene = try XCTUnwrap(previous?.windowScene)
    let window = UIWindow(windowScene: scene)
    window.frame = CGRect(origin: .zero, size: size)
    let host = UIHostingController(rootView: view.environment(AppSession()).environment(AppRouter()).tint(Palette.tintText)
      .environment(\.dynamicTypeSize, type).environment(\.colorScheme, dark ? .dark : .light))
    window.rootViewController = host
    window.overrideUserInterfaceStyle = dark ? .dark : .light
    window.makeKeyAndVisible()
    defer { window.isHidden = true; previous?.makeKeyAndVisible() }
    try await Task.sleep(for: .milliseconds(500))
    host.view.layoutIfNeeded()
    let image = UIGraphicsImageRenderer(bounds: host.view.bounds).image { _ in
      host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true)
    }
    XCTAssertGreaterThan(image.size.width, 0)
    let attachment = XCTAttachment(image: image)
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  func testReviewOnSmallPhone() async throws {
    try await capture(NavigationStack { MezzanineReviewView(model: model(), chooseAnother: {}) },
      name: "mezzanine-review-small", size: CGSize(width: 375, height: 667))
  }
  func testReviewInDarkModeAtLargestType() async throws {
    try await capture(NavigationStack { MezzanineReviewView(model: model(), chooseAnother: {}) },
      name: "mezzanine-review-dark-accessibility", size: CGSize(width: 402, height: 874), dark: true, type: .accessibility5)
  }
  func testCountrySheet() async throws {
    try await capture(MezzanineCountrySheet(city: "Example City", choose: { _ in }),
      name: "mezzanine-country", size: CGSize(width: 375, height: 667))
  }
  func testSummary() async throws {
    let model = model(); model.rows[0].saved = true; model.rows[0].selected = false
    model.added = 1; model.finished = true
    try await capture(NavigationStack { MezzanineReviewView(model: model, chooseAnother: {}) },
      name: "mezzanine-summary", size: CGSize(width: 402, height: 874))
  }
}

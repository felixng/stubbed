import Foundation
import Observation

/// Where the app is: the selected tab, each tab's navigation stack, and the
/// log sheet. Screens read `dataVersion` in `.task(id:)` to reload after any
/// save or delete, so a screen you come back to is never stale.
@MainActor @Observable
final class AppRouter {
  enum Tab: Hashable { case home, log, profile }

  /// What the entry screen says on arrival.
  enum Notice: Hashable { case saved, planned, photoFailed }

  enum FollowList: String, Hashable { case followers, following }

  enum Route: Hashable {
    case entry(UUID, notice: Notice? = nil)
    case trip(UUID, addFailed: Bool = false)
    case settings
    case profile(handle: String)
    /// Someone's public show (yours too, as others see it); `comments`
    /// scrolls to the thread.
    case publicEntry(UUID, comments: Bool = false)
    case publicTrip(UUID)
    case follows(handle: String, list: FollowList)
  }

  /// The log sheet: a new entry, or editing one.
  struct LogRequest: Identifiable {
    let id = UUID()
    var editing: Entry?
  }

  /// The trip form sheet: a new trip (optionally with shows picked in the
  /// diary and dates to fit them), or editing one.
  struct TripFormRequest: Identifiable {
    let id = UUID()
    var editing: Trip?
    var start: String?
    var end: String?
    var entryIds: [UUID] = []
  }

  var tab = Tab.home
  var homePath: [Route] = []
  var profilePath: [Route] = []
  var log: LogRequest?
  var tripForm: TripFormRequest?
  private(set) var dataVersion = 0

  func startLog() { log = LogRequest() }

  func edit(_ entry: Entry) { log = LogRequest(editing: entry) }

  /// After a save: a new entry opens on the Profile tab, where the entry
  /// screen offers sharing; an edit returns to the entry it came from.
  func saved(_ id: UUID, isNew: Bool, planned: Bool, photoFailed: Bool) {
    log = nil
    dataChanged()
    guard isNew || photoFailed else { return }
    let notice: Notice = photoFailed ? .photoFailed : planned ? .planned : .saved
    if isNew {
      tab = .profile
      profilePath = [.entry(id, notice: notice)]
    } else if let index = path(for: tab).lastIndex(where: { if case .entry(id, _) = $0 { true } else { false } }) {
      var stack = path(for: tab)
      stack[index] = .entry(id, notice: notice)
      setPath(stack, for: tab)
    }
  }

  func newTrip(start: String? = nil, end: String? = nil, entryIds: [UUID] = []) {
    tripForm = TripFormRequest(start: start, end: end, entryIds: entryIds)
  }

  func editTrip(_ trip: Trip) { tripForm = TripFormRequest(editing: trip) }

  /// After a trip save: a new trip opens on the Profile tab.
  func tripSaved(_ id: UUID, isNew: Bool, linksFailed: Bool) {
    tripForm = nil
    dataChanged()
    guard isNew else { return }
    tab = .profile
    profilePath.append(.trip(id, addFailed: linksFailed))
  }

  /// Opens a link on the current tab, closing any sheet.
  func open(_ route: Route) {
    log = nil
    tripForm = nil
    if tab == .home { homePath.append(route) } else { profilePath.append(route) }
  }

  /// Something was written or deleted: screens reload.
  func dataChanged() { dataVersion += 1 }

  private func path(for tab: Tab) -> [Route] { tab == .home ? homePath : profilePath }

  private func setPath(_ path: [Route], for tab: Tab) {
    if tab == .home { homePath = path } else { profilePath = path }
  }
}

import Supabase
import SwiftUI
import UIKit

struct PushPreferences: Decodable {
  var push_enabled = true
  var previews = false
  var quiet_start: String?
  var quiet_end: String?
  var time_zone = TimeZone.current.identifier
}

private struct GeneralNotificationChange<V: Encodable>: Encodable { let setting: String; let value: V }

struct NativePushSettings: View {
  @State private var registration = PushRegistration.shared
  @State private var preferences = PushPreferences()
  @State private var loaded = false
  @State private var busy = false
  @State private var failed = false
  @State private var quietStart = Day.date(Day.today())
  @State private var quietEnd = Day.date(Day.today())

  var body: some View {
    Section {
      Toggle("Mobile push", isOn: Binding(get: { preferences.push_enabled }, set: { value in Task { await save("push_enabled", value) } })).disabled(!loaded || busy)
      if failed { Text("Couldn’t load or confirm push preferences. Try again.").foregroundStyle(.red); Button("Try again") { Task { await load() } } }
    } header: { Text("Push") } footer: { Text("Push starts on in Stubbed. Alerts also need permission on each device. Your inbox works independently.") }
      .task { await load(); await registration.refresh() }
    Section {
      LabeledContent("Permission", value: registration.permission.rawValue)
      if registration.permission == .needed {
        Text("Allow Stubbed to tell you about likes, comments and follow activity. You choose the categories below.").foregroundStyle(.secondary)
        Button("Enable notifications on this device") { Task { await registration.enable() } }
      } else if registration.permission == .blocked {
        Text("Notifications are blocked. Change permission in iPhone Settings whenever you want.").foregroundStyle(.secondary)
        Button("Open iPhone Settings") { if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) } }
      }
      if let error = registration.error { Text(error).foregroundStyle(.red); Button("Retry device registration") { Task { await registration.refresh() } } }
    } header: { Text("This device") }
    NotificationCategorySection(channel: "push")
    Section {
      Toggle("Show notification previews", isOn: Binding(get: { preferences.previews }, set: { value in Task { await save("previews", value) } })).disabled(!loaded || busy)
      LabeledContent("Sample notification") { Text(preferences.previews ? "Alex liked your Wicked diary entry" : "You have new activity on Stubbed.").multilineTextAlignment(.trailing) }
    } header: { Text("Privacy") } footer: { Text("Previews start off. Comment text is never included in push alerts.") }
    Section {
      Toggle("Quiet hours", isOn: Binding(get: { preferences.quiet_start != nil }, set: { value in Task { await saveQuiet(enabled: value) } })).disabled(!loaded || busy)
      DatePicker("Start", selection: $quietStart, displayedComponents: .hourAndMinute).environment(\.timeZone, TimeZone(identifier: preferences.time_zone) ?? .current)
      DatePicker("End", selection: $quietEnd, displayedComponents: .hourAndMinute).environment(\.timeZone, TimeZone(identifier: preferences.time_zone) ?? .current)
      Text("Time zone: \(preferences.time_zone)").font(.footnote).foregroundStyle(.secondary)
      Button("Use this device’s time zone") { preferences.time_zone = TimeZone.current.identifier }
      if preferences.quiet_start != nil { Button("Save quiet hours") { Task { await saveQuiet(enabled: true) } }.disabled(busy) }
    } header: { Text("Quiet hours") } footer: { Text("Choose the times before enabling. Social pushes during quiet hours are skipped, with no catch-up burst. Overnight ranges are supported.") }
  }
  private func load() async {
    do {
      let rows: [PushPreferences] = try await supabase.from("notification_preferences").select("push_enabled,previews,quiet_start,quiet_end,time_zone").execute().value
      preferences = rows.first ?? PushPreferences(); loaded = true; failed = false
      let f = DateFormatter(); f.dateFormat = "HH:mm:ss"; f.timeZone = TimeZone(identifier: preferences.time_zone)
      if let start = preferences.quiet_start, let date = f.date(from: start) { quietStart = date }
      if let end = preferences.quiet_end, let date = f.date(from: end) { quietEnd = date }
    } catch { failed = true }
  }
  private func save<T: Encodable>(_ setting: String, _ value: T) async {
    busy = true; defer { busy = false }
    do { try await supabase.rpc("notification_set_general", params: GeneralNotificationChange(setting: setting, value: value)).execute(); await load() } catch { failed = true }
  }
  private func saveQuiet(enabled: Bool) async {
    struct Quiet: Encodable { let start: String; let end: String; let time_zone: String }
    let f = DateFormatter(); f.dateFormat = "HH:mm:ss"; f.timeZone = TimeZone(identifier: preferences.time_zone)
    let value: Quiet? = enabled ? Quiet(start: f.string(from: quietStart), end: f.string(from: quietEnd), time_zone: preferences.time_zone) : nil
    await save("quiet_hours", value)
  }
}

struct OpenNotificationView: View {
  let id: UUID
  @Environment(AppRouter.self) private var router
  @State private var failed = false
  var body: some View {
    Group {
      if failed { ContentUnavailableView("Activity unavailable", systemImage: "bell", description: Text("Open Notifications to see your latest activity.")) }
      else { ProgressView("Opening activity…") }
    }.navigationTitle("Notifications").task {
      do {
        let path: String = try await supabase.rpc("notification_open", params: ["notification_id": id]).execute().value
        router.dataChanged()
        guard let url = URL(string: path, relativeTo: AppConfig.current.webURL), let route = DeepLink.route(for: url.absoluteURL) else { failed = true; return }
        router.replaceTop(with: route)
      } catch { failed = true }
    }
  }
}

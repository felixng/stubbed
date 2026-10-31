import SwiftUI

struct PrivacySettingsView: View {
  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var profile: Loadable<Profile> = .loading
  @State private var isPrivate = false
  @State private var saving = false
  @State private var status: (ok: Bool, text: String)?

  var body: some View {
    Form {
      switch profile {
      case .loading:
        PlaceholderRows(count: 1)
      case .failed(let message):
        Section {
          Text(message).foregroundStyle(.secondary)
          Button("Try again") { Task { await load() } }
        }
      case .loaded(let current):
        Section {
          Toggle("Private profile", isOn: $isPrivate).tint(Palette.tint)
            .disabled(saving)
        } footer: {
          VStack(alignment: .leading, spacing: Space.s) {
            Text("Only you and followers you approve see your shows, trips and stats. Others see your handle, name, bio and link.")
            if current.isPrivate, !isPrivate {
              Text("Going public approves any follow requests waiting for you.")
            }
          }
        }
      }
      if let status {
        Section {
          Text(status.text).foregroundStyle(status.ok ? Color.primary : Color.red)
        }
      }
    }
    .tabBarClearance()
    .navigationTitle("Profile privacy")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        if saving { ProgressView() }
        else {
          Button("Save") { Task { await save() } }
            .fontWeight(.semibold)
            .disabled(profile.value == nil)
        }
      }
    }
    .task { await load() }
  }

  private func load() async {
    guard let id = session.userId else { return }
    do {
      let current = try await Profiles.profile(id)
      isPrivate = current.isPrivate
      profile = .loaded(current)
    } catch { profile = .failed("Couldn’t load your privacy settings. Try again.") }
  }

  private func save() async {
    guard let id = session.userId else { return }
    saving = true
    status = nil
    defer { saving = false }
    do {
      // Only privacy is written: a stale profile editor cannot overwrite it.
      try await supabase.from("profiles").update(["is_private": isPrivate]).eq("id", value: id).execute()
      await load()
      status = (true, isPrivate ? "Saved. Your profile is private." : "Saved. Your profile is public.")
      router.dataChanged()
    } catch { status = (false, "Couldn’t save. Try again.") }
  }
}

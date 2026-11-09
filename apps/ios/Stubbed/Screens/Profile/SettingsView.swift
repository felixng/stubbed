import Supabase
import SwiftUI

/// Account actions and preferences, separate from the profile card editor.
struct SettingsView: View {
  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @State private var profile: Loadable<Profile> = .loading
  @State private var deleting = false

  var body: some View {
    Form {
      Section("Profile") {
        NavigationLink(value: AppRouter.Route.editProfile) {
          Label("Edit profile", systemImage: "pencil")
        }
        if let profile = profile.value {
          NavigationLink(value: AppRouter.Route.profile(handle: profile.handle)) {
            Label("View public profile", systemImage: "person.crop.circle")
          }
        }
      }
      Section("Notifications") {
        NavigationLink(value: AppRouter.Route.notificationSettings) { Label("Notifications", systemImage: "bell") }
      }
      Section("Privacy") {
        NavigationLink(value: AppRouter.Route.privacySettings) {
          Label("Profile privacy", systemImage: "lock")
        }
        NavigationLink(value: AppRouter.Route.blockedAccounts) {
          Label("Blocked accounts", systemImage: "hand.raised")
        }
      }
      Section("Your diary") {
        NavigationLink(value: AppRouter.Route.importHub) {
          Label("Import shows", systemImage: "square.and.arrow.down")
        }
      }
      Section("Help and information") {
        Link(destination: URL(string: "mailto:support@getstubbed.app")!) {
          Label("Contact us", systemImage: "envelope")
        }
        ForEach([("FAQ", "faq"), ("Privacy policy", "privacy"), ("Terms", "terms")], id: \.1) { title, path in
          Link(destination: AppConfig.current.webURL.appendingPathComponent(path)) {
            HStack {
              Text(title)
              Spacer()
              Image(systemName: "arrow.up.right").font(.footnote.weight(.semibold))
            }
          }
        }
      }
      Section("Account") {
        Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
          Task { await session.signOut() }
        }
        Button("Delete account", systemImage: "trash", role: .destructive) { deleting = true }
          .disabled(profile.value == nil)
      }
      if case .failed(let message) = profile {
        Section {
          Text(message).foregroundStyle(.secondary)
          Button("Try again") { Task { await load() } }
        }
      }
    }
    .tabBarClearance()
    .navigationTitle("Settings")
    .navigationBarTitleDisplayMode(.inline)
    .task(id: router.dataVersion) { await load() }
    .sheet(isPresented: $deleting) {
      if let profile = profile.value { DeleteAccountSheet(handle: profile.handle) }
    }
  }

  private func load() async {
    guard let id = session.userId else { return }
    do { profile = .loaded(try await Profiles.profile(id)) }
    catch { profile = .failed("Couldn’t load your account. Try again.") }
  }
}

/// Deletes the account once you type your handle: photos first, then the
/// account (delete_my_account), then you're signed out.
struct DeleteAccountSheet: View {
  let handle: String

  @Environment(AppSession.self) private var session
  @Environment(Membership.self) private var membership
  @Environment(\.dismiss) private var dismiss
  @State private var typed = ""
  @State private var busy = false
  @State private var error: String?

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Confirm handle", text: $typed, prompt: Text(verbatim: handle))
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .accessibilityLabel("Type your handle, @\(handle), to confirm")
        } header: {
          Text("Type your handle, @\(handle), to confirm")
        } footer: {
          if let error {
            Text(error).foregroundStyle(.red)
          } else {
            Text(
              "This permanently deletes your profile, diary, trips, photos, follows, likes and comments."
                + (membership.info?.manage.contains("app_store") == true
                  ? " If you subscribe through the App Store, cancel it in Settings › Apple ID › Subscriptions too."
                  : ""))
          }
        }
      }
      .navigationTitle("Delete your account?")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          if busy {
            ProgressView()
          } else {
            Button("Delete", role: .destructive) { Task { await delete() } }
              .fontWeight(.semibold)
              .tint(.red)
              .disabled(ProfileRules.normalizeHandle(typed) != handle.lowercased())
              .accessibilityLabel("Delete account")
              .accessibilityIdentifier("confirm-delete-account")
          }
        }
      }
    }
    .presentationDetents([.medium, .large])
    .interactiveDismissDisabled(busy)
  }

  private func delete() async {
    guard let userId = session.userId else { return }
    let confirm = ProfileRules.normalizeHandle(typed)
    guard confirm == handle.lowercased() else { return error = "That doesn’t match your handle." }
    busy = true
    defer { busy = false }
    error = nil
    // Both buckets keep each user's files under `{user_id}/`.
    let folder = userId.uuidString.lowercased()
    for bucket in [Entries.photoBucket, Avatars.bucket] {
      let storage = supabase.storage.from(bucket)
      while true {
        guard let files = try? await storage.list(path: folder, options: SearchOptions(limit: 1000)) else {
          return error = "Couldn’t delete your photos. Try again."
        }
        if files.isEmpty { break }
        guard let removed = try? await storage.remove(paths: files.map { "\(folder)/\($0.name)" }), !removed.isEmpty else {
          return error = "Couldn’t delete your photos. Try again."
        }
      }
    }
    do {
      try await supabase.rpc("delete_my_account", params: ["confirm": confirm]).execute()
    } catch {
      Log.data.error("delete_my_account failed: \(error.localizedDescription, privacy: .public)")
      return self.error = "Couldn’t delete your account. Try again."
    }
    session.accountDeleted()
  }
}

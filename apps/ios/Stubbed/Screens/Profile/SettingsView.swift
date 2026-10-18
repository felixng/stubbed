import Supabase
import SwiftUI

/// Edit profile, like the web's /app/settings: photo, handle, name, bio,
/// link and the private switch; then sign out, links to the web's pages,
/// and account deletion.
struct SettingsView: View {
  private enum Field { case handle, name, bio, link }

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router

  @State private var loaded: Profile?
  @State private var avatarURL: URL?
  @State private var handle = ""
  @State private var name = ""
  @State private var bio = ""
  @State private var link = ""
  @State private var isPrivate = false
  @State private var saving = false
  @State private var status: (ok: Bool, text: String)?
  @State private var deleting = false
  @FocusState private var focus: Field?

  var body: some View {
    Group {
      if let profile = loaded, let userId = session.userId {
        ScrollViewReader { proxy in
          Form {
            form(profile, userId: userId)
            accountSection
            deleteSection
          }
          .scrollDismissesKeyboard(.interactively)
          // The result shows at the top, above the fields.
          .onChange(of: status?.text) { _, text in
            if text != nil { withAnimation { proxy.scrollTo("status", anchor: .top) } }
          }
        }
        .toolbar {
          ToolbarItem(placement: .confirmationAction) {
            if saving {
              ProgressView()
            } else {
              Button("Save") { Task { await save(userId: userId) } }
                .fontWeight(.semibold)
                .disabled(handleProblem != nil)
            }
          }
        }
      } else {
        ProgressView()
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(Color(.systemGroupedBackground))
      }
    }
    .navigationTitle("Edit profile")
    .navigationBarTitleDisplayMode(.inline)
    .task { await load() }
    .sheet(isPresented: $deleting) {
      if let profile = loaded { DeleteAccountSheet(handle: profile.handle) }
    }
  }

  @ViewBuilder private func form(_ profile: Profile, userId: UUID) -> some View {
    Section {
      AvatarPicker(userId: userId, name: name.isEmpty ? handle : name, url: $avatarURL)
        .buttonStyle(.borderless)
        .listRowBackground(Color.clear)
    }

    if let status {
      Section {
        Label {
          Text(status.text).foregroundStyle(status.ok ? Color.primary : Color.red)
        } icon: {
          Image(systemName: status.ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
            .foregroundStyle(status.ok ? Color.green : Color.red)
        }
      }
      .id("status")
    }

    Section {
      HStack(spacing: 2) {
        Text(verbatim: "@").foregroundStyle(.secondary).accessibilityHidden(true)
        TextField("Handle", text: $handle, prompt: Text(verbatim: "sillyelphaba"))
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .focused($focus, equals: .handle)
          .accessibilityLabel("Handle")
          .onChange(of: handle) { _, value in
            let normalized = String(ProfileRules.normalizeHandle(value).prefix(20))
            if normalized != value { handle = normalized }
          }
      }
    } header: {
      Text("Handle")
    } footer: {
      Text(handleProblem ?? "Your profile is at /@\(handle.isEmpty ? "handle" : handle).")
        .foregroundStyle(handleProblem != nil ? Color.red : Color.secondary)
    }

    Section("Name") {
      TextField("Name", text: $name, prompt: Text("Your name"))
        .textContentType(.name)
        .focused($focus, equals: .name)
        .accessibilityLabel("Name")
        .onChange(of: name) { _, v in if v.count > ProfileRules.nameMax { name = String(v.prefix(ProfileRules.nameMax)) } }
    }

    Section {
      TextField("Bio", text: $bio, prompt: Text("Musicals, mostly. Always the front row."), axis: .vertical)
        .lineLimit(3, reservesSpace: true)
        .focused($focus, equals: .bio)
        .accessibilityLabel("Bio")
        .onChange(of: bio) { _, v in if v.count > ProfileRules.bioMax { bio = String(v.prefix(ProfileRules.bioMax)) } }
    } header: {
      HStack {
        Text("Bio (optional)")
        Spacer()
        Text("\(bio.count)/\(ProfileRules.bioMax)").monospacedDigit()
      }
    }

    Section("Link (optional)") {
      TextField("Link", text: $link, prompt: Text(verbatim: "instagram.com/yourname"))
        .keyboardType(.URL)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .focused($focus, equals: .link)
        .accessibilityLabel("Link")
    }

    Section {
      Toggle("Private profile", isOn: $isPrivate)
        .tint(Palette.tint)
    } footer: {
      VStack(alignment: .leading, spacing: Space.s) {
        Text("Only you and followers you approve see your shows, trips and stats. Others see your handle, name, bio and link.")
        if profile.isPrivate, !isPrivate {
          Text("Going public approves any follow requests waiting for you.")
        }
      }
    }
  }

  private var accountSection: some View {
    Section {
      ForEach([("Privacy", "privacy"), ("Terms", "terms"), ("FAQ", "faq")], id: \.1) { title, path in
        Link(destination: AppConfig.current.webURL.appendingPathComponent(path)) {
          HStack {
            Text(title).foregroundStyle(.primary)
            Spacer()
            Image(systemName: "arrow.up.right")
              .font(.footnote.weight(.semibold))
              .foregroundStyle(.tertiary)
          }
        }
      }
      Button("Sign out") { Task { await session.signOut() } }
    }
  }

  private var deleteSection: some View {
    Section {
      Button("Delete account", role: .destructive) { deleting = true }
    } footer: {
      Text("Permanently delete your profile, diary, trips and photos. This can’t be undone.")
    }
  }

  private var handleProblem: String? {
    guard let loaded else { return nil }
    if handle == loaded.handle { return nil }
    return ProfileRules.handleProblem(handle)
  }

  private func load() async {
    guard loaded == nil, let userId = session.userId, let profile = try? await Profiles.profile(userId) else { return }
    loaded = profile
    avatarURL = profile.avatarURL
    handle = profile.handle
    name = profile.displayName ?? ""
    bio = profile.bio ?? ""
    link = profile.link ?? ""
    isPrivate = profile.isPrivate
  }

  private func save(userId: UUID) async {
    status = nil
    let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let trimmedBio = bio.trimmingCharacters(in: .whitespacesAndNewlines)
    let normalizedLink = ProfileRules.normalizeLink(link)
    if !link.trimmingCharacters(in: .whitespaces).isEmpty, normalizedLink == nil {
      return status = (false, "That doesn’t look like a web link.")
    }
    saving = true
    defer { saving = false }
    struct Update: Encodable {
      let handle: String
      let display_name: String?
      let bio: String?
      let link: String?
      let is_private: Bool
    }
    do {
      try await supabase.from("profiles")
        .update(
          Update(
            handle: handle, display_name: trimmedName.isEmpty ? nil : trimmedName, bio: trimmedBio.isEmpty ? nil : trimmedBio,
            link: normalizedLink, is_private: isPrivate)
        )
        .eq("id", value: userId).execute()
      loaded = try? await Profiles.profile(userId)
      status = (true, isPrivate ? "Saved. Your profile is private." : "Saved. Your profile is public.")
      router.dataChanged()
    } catch {
      if ProfileRules.isTakenError(error) {
        status = (false, "That handle is taken.")
      } else if ProfileRules.isReservedError(error) {
        status = (false, "That handle is reserved. Try another.")
      } else {
        status = (false, "Couldn’t save. Try again.")
      }
    }
  }
}

/// Deletes the account once you type your handle: photos first, then the
/// account (delete_my_account), then you're signed out.
struct DeleteAccountSheet: View {
  let handle: String

  @Environment(AppSession.self) private var session
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
            Text("This permanently deletes your profile, diary, trips, photos, follows, likes and comments.")
          }
        }
        Section {
          Button(role: .destructive) {
            Task { await delete() }
          } label: {
            HStack {
              Spacer()
              if busy { ProgressView() } else { Text("Delete account").fontWeight(.semibold) }
              Spacer()
            }
          }
          .disabled(busy || ProfileRules.normalizeHandle(typed) != handle.lowercased())
          .accessibilityIdentifier("confirm-delete-account")
        }
      }
      .navigationTitle("Delete your account?")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
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

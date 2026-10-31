import Supabase
import SwiftUI

/// The profile card editor. Account and privacy controls live in Settings.
struct EditProfileView: View {
  private enum Field { case handle, name, bio, link }

  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router

  @State private var loaded: Profile?
  @State private var avatarURL: URL?
  @State private var handle = ""
  @State private var name = ""
  @State private var bio = ""
  @State private var link = ""
  @State private var saving = false
  @State private var status: (ok: Bool, text: String)?
  @FocusState private var focus: Field?

  var body: some View {
    Group {
      if loaded != nil, let userId = session.userId {
        ScrollViewReader { proxy in
          Form {
            form(userId: userId)
          }
          .scrollDismissesKeyboard(.interactively)
          .tabBarClearance()
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
        Form { PlaceholderRows(count: 4) }
      }
    }
    .navigationTitle("Edit profile")
    .navigationBarTitleDisplayMode(.inline)
    .task { await load() }
  }

  @ViewBuilder private func form(userId: UUID) -> some View {
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
    }
    do {
      try await supabase.from("profiles")
        .update(
          Update(
            handle: handle, display_name: trimmedName.isEmpty ? nil : trimmedName, bio: trimmedBio.isEmpty ? nil : trimmedBio,
            link: normalizedLink)
        )
        .eq("id", value: userId).execute()
      loaded = try? await Profiles.profile(userId)
      status = (true, "Saved.")
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

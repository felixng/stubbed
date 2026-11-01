import Supabase
import SwiftUI

/// Onboarding, like the web's /welcome: photo, name, handle, bio and one
/// link. The photo saves on its own as soon as it's picked; the rest saves
/// on Continue. The handle is checked as it's typed, and the save still
/// catches one taken in the meantime.
struct WelcomeView: View {
  private enum Field { case name, handle, bio, link }
  private enum Availability: Equatable { case checking, available, taken, reserved }

  @Environment(AppSession.self) private var session

  @State private var loaded = false
  @State private var avatarURL: URL?
  @State private var name = ""
  @State private var handle = ""
  @State private var bio = ""
  @State private var link = ""
  @State private var availability: Availability?
  @State private var errors: [Field: String] = [:]
  @State private var formError: String?
  @State private var saving = false
  @FocusState private var focus: Field?

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Text("Set up your profile").font(.headline)
          Text("Your handle goes on your share cards and profile link.")
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        if loaded, let userId = session.userId {
          fields(userId: userId)
        } else {
          PlaceholderRows(count: 4)
        }
      }
      .scrollDismissesKeyboard(.interactively)
      .navigationTitle("Welcome")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Sign out") { Task { await session.signOut() } }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(saving ? "Saving…" : "Continue") {
            if let userId = session.userId { Task { await save(userId: userId) } }
          }
          .disabled(!loaded || saving || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || ProfileRules.handleProblem(handle) != nil || availability == .taken || availability == .reserved)
        }
      }
    }
    .task { await load() }
    .task(id: handle) { await checkHandle() }
    .onChange(of: availability) { _, value in
      if value != nil, value != .checking { AccessibilityNotification.Announcement(handleMessage).post() }
    }
  }

  @ViewBuilder private func fields(userId: UUID) -> some View {
    Section {
      AvatarPicker(userId: userId, name: name.isEmpty ? handle : name, url: $avatarURL)
        .buttonStyle(.borderless)
        .listRowBackground(Color.clear)
    }
    Section {
      TextField("Name", text: $name, prompt: Text("Your name"))
        .textContentType(.name)
        .accessibilityLabel("Name")
        .focused($focus, equals: .name)
        .submitLabel(.next)
        .onSubmit { focus = .handle }
        .onChange(of: name) { _, value in
          if value.count > ProfileRules.nameMax { name = String(value.prefix(ProfileRules.nameMax)) }
        }
    } header: { Text("Name") } footer: {
      if let message = errors[.name] { Text(message).foregroundStyle(.red) }
    }
    Section {
      HStack(spacing: 2) {
        Text(verbatim: "@").foregroundStyle(.secondary).accessibilityHidden(true)
        TextField("Handle", text: $handle, prompt: Text(verbatim: "yourname"))
          .textContentType(.username)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .accessibilityLabel("Handle")
          .focused($focus, equals: .handle)
          .submitLabel(.next)
          .onSubmit { focus = .bio }
          .onChange(of: handle) { _, value in
            let normalized = String(ProfileRules.normalizeHandle(value).prefix(20))
            if normalized != value { handle = normalized }
          }
      }
    } header: { Text("Handle") } footer: {
      Text(handleMessage).foregroundStyle(handleIsError ? Color.red : Color.secondary)
    }
    Section {
      TextField("Bio", text: $bio, prompt: Text("Musicals, mostly. Always the front row."), axis: .vertical)
        .lineLimit(3, reservesSpace: true)
        .accessibilityLabel("Bio")
        .focused($focus, equals: .bio)
        .onChange(of: bio) { _, value in
          if value.count > ProfileRules.bioMax { bio = String(value.prefix(ProfileRules.bioMax)) }
        }
    } header: {
      Text("Bio (optional)")
    } footer: {
      Text("\(bio.count)/\(ProfileRules.bioMax)")
    }
    Section {
      TextField("Link", text: $link, prompt: Text(verbatim: "instagram.com/yourname"))
        .keyboardType(.URL)
        .textContentType(.URL)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .accessibilityLabel("Link")
        .focused($focus, equals: .link)
        .submitLabel(.go)
        .onSubmit { Task { await save(userId: userId) } }
    } header: { Text("Link (optional)") } footer: {
      if let message = errors[.link] { Text(message).foregroundStyle(.red) }
    }
    if let formError {
      Section { Text(formError).foregroundStyle(.red) }
    }
  }

  // MARK: - Handle

  private var handleProblem: String? {
    handle.isEmpty ? nil : ProfileRules.handleProblem(handle)
  }

  private var handleMessage: String {
    if let handleProblem { return handleProblem }
    switch availability {
    case .taken: return "That handle is taken."
    case .reserved: return "That handle is reserved. Try another."
    case .available: return "@\(handle) is yours."
    case .checking: return "Checking…"
    case nil: return errors[.handle] ?? "3–20 letters, numbers or underscores."
    }
  }

  private var handleIsError: Bool {
    handleProblem != nil || availability == .taken || availability == .reserved
      || (errors[.handle] != nil && availability != .available)
  }

  /// Debounced by `.task(id:)`: typing again cancels the wait.
  private func checkHandle() async {
    availability = nil
    guard !handle.isEmpty, ProfileRules.handleProblem(handle) == nil else { return }
    availability = .checking
    try? await Task.sleep(for: .milliseconds(350))
    guard !Task.isCancelled else { return }
    let current = handle
    do {
      async let reserved: Bool = supabase.rpc("is_reserved_handle", params: ["h": current]).execute().value
      struct Row: Decodable { let id: UUID }
      async let owners: [Row] = supabase.from("profiles").select("id").eq("handle", value: current).limit(1).execute()
        .value
      let (isReserved, rows) = try await (reserved, owners)
      guard !Task.isCancelled, current == handle else { return }
      availability = isReserved ? .reserved : rows.contains { $0.id != session.userId } ? .taken : .available
    } catch {
      // Say nothing: the save still checks.
      if !Task.isCancelled { availability = nil }
    }
  }

  // MARK: - Load and save

  /// Prefills what we already know: a name saved earlier, or the one from
  /// Google or Apple. Copies the Google photo the first time.
  private func load() async {
    guard !loaded, let user = session.user else { return }
    struct Row: Decodable {
      let display_name: String?
      let bio: String?
      let link: String?
      let avatar_url: String?
    }
    let row: Row? = try? await supabase.from("profiles")
      .select("display_name, bio, link, avatar_url").eq("id", value: user.id).single().execute().value
    let meta = user.userMetadata
    let providerName = meta["full_name"]?.stringValue ?? meta["name"]?.stringValue ?? ""
    name = String((row?.display_name ?? providerName).prefix(ProfileRules.nameMax))
    bio = row?.bio ?? ""
    link = row?.link ?? ""
    avatarURL = row?.avatar_url.flatMap(URL.init(string:))
    loaded = true
    if avatarURL == nil, let imported = await Avatars.importGooglePhoto(for: user) {
      avatarURL = imported
    }
  }

  private func save(userId: UUID) async {
    let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let bio = bio.trimmingCharacters(in: .whitespacesAndNewlines)
    let normalizedLink = ProfileRules.normalizeLink(link)
    var errors: [Field: String] = [:]
    if name.isEmpty { errors[.name] = "Add your name." }
    if let problem = ProfileRules.handleProblem(handle) { errors[.handle] = problem }
    if !link.trimmingCharacters(in: .whitespaces).isEmpty, normalizedLink == nil {
      errors[.link] = "That doesn’t look like a web link."
    }
    self.errors = errors
    formError = nil
    guard errors.isEmpty else { return }

    saving = true
    defer { saving = false }
    struct Update: Encodable {
      let display_name: String
      let handle: String
      let bio: String?
      let link: String?
    }
    do {
      try await supabase.from("profiles")
        .update(Update(display_name: name, handle: handle, bio: bio.isEmpty ? nil : bio, link: normalizedLink))
        .eq("id", value: userId)
        .execute()
      session.profileCompleted()
    } catch {
      if ProfileRules.isTakenError(error) {
        self.errors[.handle] = "That handle is taken."
        availability = .taken
      } else if ProfileRules.isReservedError(error) {
        availability = .reserved
      } else {
        Log.data.error("Saving the profile failed: \(error.localizedDescription, privacy: .public)")
        formError = "Couldn’t save. Try again."
      }
    }
  }
}

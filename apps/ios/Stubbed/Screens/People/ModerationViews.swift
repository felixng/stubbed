import SwiftUI

/// Report a show, a comment or a profile: why, an optional note, and (when
/// it's someone else's) the option to block them too. A sheet with Cancel and
/// Send in the bar; the thanks replaces the form once it's sent.
struct ReportSheet: View {
  let target: Reports.Target
  /// Who made it, for "Also block @handle". Nil hides the option.
  var owner: Person?

  @Environment(\.dismiss) private var dismiss
  @Environment(AppRouter.self) private var router
  @State private var reason: Reports.Reason?
  @State private var note = ""
  @State private var alsoBlock = false
  @State private var sending = false
  @State private var sent = false
  @State private var error: String?

  var body: some View {
    NavigationStack {
      Group {
        if sent { thanks } else { form }
      }
      .navigationTitle("Report")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        if sent {
          ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
        } else {
          ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
          ToolbarItem(placement: .confirmationAction) {
            if sending {
              ProgressView()
            } else {
              Button("Send") { Task { await send() } }
                .fontWeight(.semibold)
                .disabled(reason == nil)
            }
          }
        }
      }
    }
    .presentationDetents([.large])
    .interactiveDismissDisabled(sending)
  }

  private var form: some View {
    Form {
      Section {
        ForEach(Reports.Reason.allCases) { option in
          Button {
            reason = option
          } label: {
            HStack {
              Text(option.label).foregroundStyle(Color(.label))
              Spacer()
              if reason == option {
                Image(systemName: "checkmark").fontWeight(.semibold).foregroundStyle(.tint)
              }
            }
          }
          .accessibilityAddTraits(reason == option ? .isSelected : [])
        }
      } header: {
        Text("Why are you reporting \(target.noun)?")
      }
      Section {
        TextField("Details", text: $note, prompt: Text("Add details (optional)"), axis: .vertical)
          .lineLimit(3...6)
          .accessibilityLabel("Details")
      } footer: {
        Text("Reports are private. We look at every one within 24 hours.")
      }
      if let owner {
        Section {
          Toggle("Also block @\(owner.handle)", isOn: $alsoBlock)
        } footer: {
          Text("You won’t see each other’s shows, and they can’t follow you, like or comment. They aren’t told.")
        }
      }
      if let error {
        Section { Text(error).foregroundStyle(.red) }
      }
    }
  }

  private var thanks: some View {
    ContentUnavailableView {
      Label("Thanks for telling us", systemImage: "checkmark.shield")
    } description: {
      Text(alsoBlock && owner != nil
        ? "We’ll look at this within 24 hours. You’ve also blocked @\(owner!.handle)."
        : "We’ll look at this within 24 hours.")
    }
  }

  private func send() async {
    guard let reason else { return }
    sending = true
    defer { sending = false }
    error = nil
    do {
      try await Reports.send(target, reason: reason, note: note)
      if alsoBlock, let owner {
        try await Blocks.block(owner.id)
        router.dataChanged()
      }
      withAnimation { sent = true }
    } catch {
      self.error = "Couldn’t send the report. Try again."
    }
  }
}

/// Settings → Blocked accounts: everyone you've blocked, with Unblock.
struct BlockedAccountsView: View {
  @Environment(AppRouter.self) private var router
  @State private var people: Loadable<[Person]> = .loading
  @State private var unblocking: Person?

  var body: some View {
    List {
      switch people {
      case .loading:
        PlaceholderRows(count: 2)
      case .failed(let message):
        EmptyState(title: "Couldn’t load blocked accounts", systemImage: "wifi.exclamationmark") { Text(message) }
          .listRowBackground(Color.clear)
      case .loaded(let list) where list.isEmpty:
        EmptyState(title: "No one blocked", systemImage: "hand.raised") {
          Text("People you block can’t see your shows, follow you, like or comment. Block someone from their profile.")
        }
        .listRowBackground(Color.clear)
      case .loaded(let list):
        Section {
          ForEach(list) { person in
            HStack(spacing: Space.m) {
              Avatar(name: person.name, url: person.avatarURL, size: 40)
              VStack(alignment: .leading, spacing: 0) {
                Text(verbatim: "@\(person.handle)").font(.subheadline.weight(.semibold))
                if let name = person.displayName, !name.isEmpty {
                  Text(name).font(.footnote).foregroundStyle(.secondary)
                }
              }
              Spacer(minLength: 0)
              Button("Unblock") { unblocking = person }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .accessibilityLabel("Unblock @\(person.handle)")
            }
          }
        } footer: {
          Text("Unblocking doesn’t bring back follows.")
        }
      }
    }
    .listStyle(.insetGrouped)
    .navigationTitle("Blocked accounts")
    .navigationBarTitleDisplayMode(.inline)
    .confirmationDialog(
      "Unblock @\(unblocking?.handle ?? "")?",
      isPresented: Binding(get: { unblocking != nil }, set: { if !$0 { unblocking = nil } }),
      titleVisibility: .visible, presenting: unblocking
    ) { person in
      Button("Unblock") { Task { await unblock(person) } }
    } message: { _ in
      Text("They’ll be able to see your public shows and follow you again.")
    }
    .task(id: router.dataVersion) { await load() }
  }

  private func load() async {
    do {
      people = .loaded(try await Blocks.list())
    } catch {
      if people.value == nil { people = .failed("Check your connection and try again.") }
    }
  }

  private func unblock(_ person: Person) async {
    try? await Blocks.unblock(person.id)
    router.dataChanged()
  }
}

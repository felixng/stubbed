import SwiftUI

/// Create or edit a trip: a name and its dates. A new trip can start with
/// shows already in it (picked in the diary), with the dates set to fit.
struct TripForm: View {
  let request: AppRouter.TripFormRequest

  @Environment(AppRouter.self) private var router
  @Environment(\.dismiss) private var dismiss

  @State private var name: String
  @State private var start: Date
  @State private var end: Date
  @State private var saving = false
  @State private var error: String?
  @FocusState private var nameFocused: Bool

  init(request: AppRouter.TripFormRequest) {
    self.request = request
    let today = Day.today()
    _name = State(initialValue: request.editing?.name ?? "")
    _start = State(initialValue: Day.date(request.editing?.startDate ?? request.start ?? today))
    _end = State(initialValue: Day.date(request.editing?.endDate ?? request.end ?? request.start ?? today))
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Name", text: $name, prompt: Text(verbatim: "NYC Oct 2026"))
            .accessibilityLabel("Name")
            .focused($nameFocused)
            .submitLabel(.done)
            .onChange(of: name) { _, value in if value.count > 100 { name = String(value.prefix(100)) } }
        }
        Section {
          DatePicker("From", selection: $start, displayedComponents: .date)
          DatePicker("To", selection: $end, in: start..., displayedComponents: .date)
        } footer: {
          Text(note)
        }
        if let error {
          Section {
            Text(error).foregroundStyle(.red)
          }
        }
      }
      .navigationTitle(request.editing != nil ? "Edit trip" : "New trip")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          if saving {
            ProgressView()
          } else {
            Button(request.editing != nil ? "Save" : "Create") { Task { await save() } }
              .fontWeight(.semibold)
          }
        }
      }
      .onChange(of: start) { _, value in if end < value { end = value } }
      .onAppear { if request.editing == nil { nameFocused = true } }
    }
  }

  private var note: String {
    let n = request.entryIds.count
    let picked = n == 0 ? "" : "The \(n) show\(n == 1 ? "" : "s") you picked will be added. "
    return picked + "A trip holds shows dated within it, and is public when one of them is."
  }

  private func save() async {
    error = nil
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return error = "Give the trip a name." }
    let from = Day.string(start)
    let to = Day.string(end)
    guard to >= from else { return error = "The end date is before the start date." }
    saving = true
    defer { saving = false }
    do {
      let saved = try await Trips.save(
        editing: request.editing, name: trimmed, start: from, end: to, entryIds: request.entryIds)
      router.tripSaved(saved.trip.id, isNew: request.editing == nil, linksFailed: saved.linksFailed)
    } catch {
      self.error = error.localizedDescription
    }
  }
}

import SwiftUI

struct MezzanineReviewView: View {
  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @Bindable var model: MezzanineReviewModel
  var chooseAnother: () -> Void
  @State private var editing: MezzanineDraft?
  @State private var countryCity: String?

  var body: some View {
    List {
      if model.busy {
        Section { ProgressView(model.progress).accessibilityAddTraits(.updatesFrequently) }
      }
      if let error = model.error {
        Section {
          ContentUnavailableView("Couldn’t read your import", systemImage: "doc.questionmark", description: Text(error))
          Button("Try again") { Task { if let id = session.userId { await model.load(userId: id) } } }
          Button("Choose another file", action: chooseAnother)
        }
      }
      if model.finished {
        Section("Import summary") {
          Text("\(model.added) added, \(model.rows.filter { !$0.saved && !$0.duplicate }.count) to finish, \(model.rows.filter(\.duplicate).count) already in your diary")
          let failures = model.rows.filter { $0.error != nil }.count
          if failures > 0 { Text("\(failures) couldn’t be saved. Your selections are kept for retry.") }
          Button("View diary") { router.finishImport(logged: model.added) }
        }
      }
      if !model.cities.isEmpty && !model.busy {
        Section("Countries") {
          ForEach(model.cities, id: \.self) { city in
            Button("Where is \(city)?") { countryCity = city }
          }
        }
      }
      if !model.rows.isEmpty {
        Section {
          Text("Private notes aren’t imported.")
          if model.rows.contains(where: { $0.source.planned }) {
            Text("Future dates become planned shows, without ratings.")
          }
          if model.rows.allSatisfy(\.duplicate) { Text("Every show in this file is already in your diary.") }
        }
        rows("Ready") { !$0.saved && !$0.duplicate && $0.missing.isEmpty }
        rows("Needs attention") { !$0.saved && !$0.duplicate && !$0.missing.isEmpty }
        rows("Already in your diary") { !$0.saved && $0.duplicate }
      }
    }
    .listStyle(.insetGrouped)
    .tabBarClearance()
    .navigationTitle("Review Mezzanine import")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .bottomBar) {
        Button("Import \(model.selected) \(model.selected == 1 ? "show" : "shows")") { Task { if let id = session.userId { await model.save(userId: id) } } }
          .buttonStyle(.borderedProminent)
          .disabled(model.busy || model.selected == 0)
      }
    }
    .navigationBarBackButtonHidden(model.busy)
    .task { if model.rows.isEmpty, model.error == nil, let id = session.userId { await model.load(userId: id) } }
    .sheet(item: $editing) { draft in
      MezzanineEditSheet(draft: draft, before: model.started) { edited in
        if let i = model.rows.firstIndex(where: { $0.id == edited.id }) { model.rows[i] = edited }
      }
    }
    .sheet(isPresented: Binding(get: { countryCity != nil }, set: { if !$0 { countryCity = nil } })) {
      if let city = countryCity {
        MezzanineCountrySheet(city: city) { code in model.applyCountry(code, city: city); countryCity = nil }
      }
    }
  }

  @ViewBuilder private func rows(_ title: String, matching: (MezzanineDraft) -> Bool) -> some View {
    let items = model.rows.filter(matching)
    if !items.isEmpty {
      Section(title) {
        ForEach(items) { row in
          VStack(alignment: .leading, spacing: Space.s) {
            Button {
              if !row.missing.isEmpty { editing = row }
              else if let i = model.rows.firstIndex(where: { $0.id == row.id }) { model.rows[i].selected.toggle() }
            } label: {
              HStack(alignment: .top) {
                Image(systemName: row.selected ? "checkmark.circle.fill" : "circle").foregroundStyle(Palette.tintText)
                VStack(alignment: .leading, spacing: Space.xs) {
                  Text(row.show.title.isEmpty ? "Untitled show" : row.show.title).font(.headline)
                  Text([row.venue.name, row.venue.city ?? ""].filter { !$0.isEmpty }.joined(separator: ", ")).font(.subheadline).foregroundStyle(.secondary)
                  if let date = row.source.date { Text(Day.date(date).formatted(date: .abbreviated, time: .omitted)).font(.subheadline) }
                  if let rating = row.source.rating { RatingStars(value: rating) }
                  if row.duplicate { Text("Already in your diary").font(.footnote) }
                  if !row.missing.isEmpty { Text("Missing or invalid: \(row.missing.joined(separator: ", "))").font(.footnote) }
                  if let error = row.error { Text(error).font(.footnote).foregroundStyle(.red) }
                }
                Spacer(minLength: 0)
              }
              .frame(minHeight: 44, alignment: .leading)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityValue(row.selected ? "Ticked" : "Unticked")
            Button("Edit show") { editing = row }.font(.subheadline)
          }
          .disabled(model.busy)
        }
      }
    }
  }
}

struct MezzanineCountrySheet: View {
  let city: String
  var choose: (String) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var search = ""
  private var countries: [(String, String)] {
    Locale.Region.isoRegions.compactMap { region in
      let code = region.identifier
      guard code.count == 2, let name = Locale.current.localizedString(forRegionCode: code) else { return nil }
      return (code, name)
    }.sorted { $0.1 < $1.1 }.filter { search.isEmpty || $0.1.localizedCaseInsensitiveContains(search) }
  }
  var body: some View {
    NavigationStack {
      List(countries, id: \.0) { code, name in Button(name) { choose(code) } }
        .searchable(text: $search)
        .navigationTitle("Where is \(city)?")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
    }
  }
}

private struct MezzanineEditSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(AppSession.self) private var session
  @State var draft: MezzanineDraft
  let before: Date
  var save: (MezzanineDraft) -> Void
  @State private var busy = false
  @State private var error: String?
  @State private var country = false

  var body: some View {
    NavigationStack {
      Form {
        Section("Show") { TextField("Show", text: $draft.show.title).onChange(of: draft.show.title) { draft.show.id = nil } }
        Section("Theatre") {
          TextField("Venue", text: $draft.venue.name).onChange(of: draft.venue.name) { draft.venue.id = nil }
          TextField("City", text: Binding(get: { draft.venue.city ?? "" }, set: { draft.venue.city = $0; draft.venue.id = nil; draft.venue.country = nil }))
          Button(draft.venue.country.flatMap { Locale.current.localizedString(forRegionCode: $0) } ?? "Choose country") { country = true }
        }
        Section("Date") {
          TextField("YYYY-MM-DD", text: Binding(get: { draft.source.date ?? "" }, set: { draft.source.date = $0 }))
            .keyboardType(.numbersAndPunctuation)
        }
        Section("Rating") {
          RatingInput(value: $draft.source.rating)
          if draft.source.invalidRating { Text("Choose a rating or clear it before saving.") }
          Button("Clear rating") { draft.source.rating = nil; draft.source.invalidRating = false }
        }
        Section("Review") { TextEditor(text: $draft.source.review).frame(minHeight: 100) }
        if let error { Section { Text(error).foregroundStyle(.red) } }
      }
      .navigationTitle("Fix imported show")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { Task { await confirm() } }.disabled(busy)
        }
      }
      .sheet(isPresented: $country) {
        MezzanineCountrySheet(city: draft.venue.city ?? "this theatre") { code in draft.venue.country = code; country = false }
      }
    }
    .interactiveDismissDisabled(busy)
  }

  private func confirm() async {
    guard let userId = session.userId else { return }
    busy = true; defer { busy = false }
    do {
      draft.show.title = draft.show.title.trimmingCharacters(in: .whitespacesAndNewlines)
      draft.venue.name = draft.venue.name.trimmingCharacters(in: .whitespacesAndNewlines)
      draft.source.date = MezzanineImport.calendarDay(draft.source.date ?? "")
      if draft.source.rating != nil { draft.source.invalidRating = false }
      if draft.show.id == nil, let same = try await Entries.similarShows(draft.show.title).first(where: \.same) { draft.show = ShowChoice(same.item) }
      if draft.venue.id == nil, let same = try await Entries.similarVenues(draft.venue.name, near: nil, city: draft.venue.city).first(where: \.same) { draft.venue = VenueChoice(same.item) }
      guard draft.missing.isEmpty else { error = "Check \(draft.missing.joined(separator: ", "))."; return }
      draft.source.planned = draft.source.date.map { $0 > Day.today() } ?? false
      if draft.source.planned { draft.source.rating = nil }
      draft.source.review = String(draft.source.review.prefix(10_000))
      let existing = try await MezzanineResolver.existing(userId: userId, shows: draft.show.id.map { [$0] } ?? [], before: before)
      draft.duplicate = MezzanineResolver.isDuplicate(show: draft.show.id, date: draft.source.date, existing: existing)
      draft.selected = !draft.duplicate
      save(draft); dismiss()
    } catch { self.error = "Couldn’t match this show. Try again. Your edits are kept." }
  }
}

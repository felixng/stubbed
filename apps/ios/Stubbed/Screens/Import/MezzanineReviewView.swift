import SwiftUI

struct MezzanineReviewView: View {
  @Environment(AppSession.self) private var session
  @Environment(AppRouter.self) private var router
  @Bindable var model: MezzanineReviewModel
  var chooseAnother: () -> Void
  @State private var editing: MezzanineDraft?
  @State private var countryCity: String?
  @State private var readyExpanded = false
  @State private var duplicatesExpanded = false
  @AccessibilityFocusState private var summaryFocused: Bool

  var body: some View {
    ScrollViewReader { proxy in
      List {
        if model.busy {
          Section { ProgressView(model.progress).accessibilityAddTraits(.updatesFrequently) }
        }
        if let error = model.error {
          Section {
            ContentUnavailableView("Couldn’t read your import", systemImage: "doc.questionmark", description: Text(error))
            if model.retryable { Button("Try again") { load() } }
            Button("Choose another file", action: chooseAnother)
          }
        }
        if model.matchingStopped {
          Section {
            Text(model.progress)
            Button("Resume matching") { load() }
            Button("Choose another file", action: chooseAnother)
          }
        }
        if model.finished {
          Section {
            Text(model.resultTitle).font(.title2.bold()).accessibilityFocused($summaryFocused)
            if !model.resultDetails.isEmpty { Text(model.resultDetails).foregroundStyle(.secondary) }
            if !model.needsAttention.isEmpty {
              Button("Fix \(model.needsAttention.count) \(model.needsAttention.count == 1 ? "show" : "shows")") {
                withAnimation { proxy.scrollTo("attention", anchor: .top) }
              }
            }
            if model.selected > 0 {
              Button(model.stopped ? "Continue importing" : "Retry selected shows") { save() }
                .buttonStyle(.bordered)
            }
          } header: { Text(model.stopped ? "Import stopped" : "Import summary") }
          .id("summary")
        }
        if !model.rows.isEmpty {
          if !model.finished {
          Section {
            Text("\(model.ready.count) ready · \(model.needsAttention.count) \(model.needsAttention.count == 1 ? "needs" : "need") attention · \(model.duplicates.count) already in your diary")
              .font(.subheadline).foregroundStyle(.secondary)
            if !model.needsAttention.isEmpty {
              Button("\(model.needsAttention.count) \(model.needsAttention.count == 1 ? "needs" : "need") attention", systemImage: "exclamationmark.circle") {
                withAnimation { proxy.scrollTo("attention", anchor: .top) }
              }
            }
          }
          }
          countries
          Section {
            Text("Private notes aren’t imported.").font(.footnote).foregroundStyle(.secondary)
            if model.rows.contains(where: { $0.source.planned }) {
              Text("Future dates become planned shows, without ratings.").font(.footnote).foregroundStyle(.secondary)
            }
            if model.rows.allSatisfy(\.duplicate) { Text("Every show in this file is already in your diary.") }
          }
          if !model.needsAttention.isEmpty {
            Section("Needs attention · \(model.needsAttention.count)") {
              ForEach(model.needsAttention) { row in importRow(row) }
            }.id("attention")
          }
          if !model.ready.isEmpty {
            Section {
              DisclosureGroup("Ready · \(model.ready.count)", isExpanded: $readyExpanded) {
                Button(model.ready.allSatisfy(\.selected) ? "Untick all ready shows" : "Select all ready shows") {
                  model.selectReady(!model.ready.allSatisfy(\.selected))
                }
                .disabled(model.busy)
                ForEach(model.ready) { row in importRow(row) }
              }
            }
          }
          if !model.duplicates.isEmpty {
            Section {
              DisclosureGroup("Already in your diary · \(model.duplicates.count)", isExpanded: $duplicatesExpanded) {
                ForEach(model.duplicates) { row in importRow(row) }
              }
            }
          }
        }
      }
      .listStyle(.insetGrouped)
      .tabBarClearance()
      .onChange(of: model.finished) { _, finished in
        if finished { proxy.scrollTo("summary", anchor: .top); summaryFocused = true }
      }
    }
    .navigationTitle("Review import")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .bottomBar) {
        if model.busy {
          Button(model.stopRequested ? "Stopping…" : "Stop", action: model.requestStop)
            .buttonStyle(.bordered).disabled(model.stopRequested)
        } else if model.finished {
          Button("View diary") { router.finishImport(logged: model.added) }
            .buttonStyle(.borderedProminent)
        } else if !model.rows.isEmpty {
          Button("Import \(model.selected) \(model.selected == 1 ? "show" : "shows")", action: save)
            .buttonStyle(.borderedProminent).disabled(model.selected == 0)
        }
      }
    }
    .navigationBarBackButtonHidden(model.busy)
    .task {
      readyExpanded = model.ready.count <= 10
      if model.rows.isEmpty, model.error == nil, !model.matchingStopped, let id = session.userId { await model.load(userId: id) }
    }
    .onChange(of: model.ready.count) { _, count in
      if count > 10 { readyExpanded = false } else if !model.finished { readyExpanded = true }
    }
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

  @ViewBuilder private var countries: some View {
    if !model.cities.isEmpty || model.countryNotice != nil {
      Section {
        ForEach(model.cities, id: \.self) { city in
          Button("Where is \(city)?") { countryCity = city }
          if let code = model.lastCountry, let name = Locale.current.localizedString(forRegionCode: code) {
            Button("Use \(name) for \(city)") { model.applyCountry(code, city: city) }
              .font(.subheadline)
          }
        }
        if let notice = model.countryNotice {
          Text(notice).font(.footnote).foregroundStyle(.secondary).accessibilityAddTraits(.updatesFrequently)
        }
      } header: { Text("Countries") }
        footer: { Text("Mezzanine doesn’t say which country a theatre is in. Choose one so your stats group correctly.") }
      .disabled(model.busy)
    }
  }

  private func importRow(_ row: MezzanineDraft) -> some View {
    let needsFix = !row.missing.isEmpty || row.error != nil
    let editLabel = "Edit \(row.show.title), \(row.source.date.map(Day.format) ?? "date missing")"
    return Button {
      if needsFix { editing = row }
      else if let i = model.rows.firstIndex(where: { $0.id == row.id }) { model.rows[i].selected.toggle() }
    } label: {
      HStack(alignment: .top) {
        Image(systemName: needsFix ? "exclamationmark.circle" : row.selected ? "checkmark.circle.fill" : "circle")
          .foregroundStyle(needsFix ? Color.secondary : Palette.tintText)
        VStack(alignment: .leading, spacing: Space.xs) {
          Text(row.show.title.isEmpty ? "Untitled show" : row.show.title).font(.headline).foregroundStyle(.primary)
          Text([row.venue.name, row.venue.city ?? ""].filter { !$0.isEmpty }.joined(separator: ", "))
            .font(.footnote).foregroundStyle(.secondary)
          ViewThatFits(in: .horizontal) {
            HStack {
              if let date = row.source.date { Text(Day.date(date).formatted(date: .abbreviated, time: .omitted)).font(.footnote) }
              if let rating = row.source.rating { RatingStars(value: rating) }
            }
            VStack(alignment: .leading) {
              if let date = row.source.date { Text(Day.date(date).formatted(date: .abbreviated, time: .omitted)).font(.footnote) }
              if let rating = row.source.rating { RatingStars(value: rating) }
            }
          }
          if row.duplicate { Text("Already in your diary").font(.footnote).foregroundStyle(.secondary) }
          if !row.missing.isEmpty { Text(row.attentionMessage).font(.footnote).foregroundStyle(.secondary) }
          if let error = row.error { Text(error).font(.footnote).foregroundStyle(.red) }
        }
        Spacer(minLength: 0)
      }
      .frame(minHeight: 44, alignment: .leading).contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(model.busy)
    .accessibilityElement(children: .combine)
    .accessibilityValue(needsFix ? "Needs attention" : row.selected ? "Ticked" : "Unticked")
    .accessibilityAction(named: editLabel) { editing = row }
    .swipeActions { Button(editLabel, systemImage: "pencil") { editing = row } }
    .contextMenu { Button(editLabel, systemImage: "pencil") { editing = row } }
  }

  private func load() { Task { if let id = session.userId { await model.load(userId: id) } } }
  private func save() { Task { if let id = session.userId { await model.save(userId: id) } } }
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
          Button("Apply") { Task { await confirm() } }.disabled(busy)
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

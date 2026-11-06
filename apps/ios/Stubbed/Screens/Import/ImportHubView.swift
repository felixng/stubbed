import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct ImportHubView: View {
  @Environment(AppRouter.self) private var router
  @State private var photos: [PhotosPickerItem] = []
  @State private var pickingFile = false
  @State private var help = false
  @State private var review = false
  @State private var model = MezzanineReviewModel()

  var body: some View {
    List {
      Section {
        PhotosPicker(selection: $photos, maxSelectionCount: PhotoImport.maxPhotos,
                     selectionBehavior: .ordered, matching: .images) {
          sourceRow("Photos", subtitle: "Pick photos from your shows. Stubbed sorts them by show.", symbol: "photo.stack")
        }
        .buttonStyle(.plain)
        Button { pickingFile = true } label: {
          sourceRow("Mezzanine export", subtitle: "Bring over your Mezzanine diary from a CSV or JSON file.", symbol: "doc.badge.arrow.up")
        }
        .buttonStyle(.plain)
        Button("How to export from Mezzanine", systemImage: "questionmark.circle") { help = true }
      }

    }
    .listStyle(.insetGrouped)
    .tabBarClearance()
    .navigationTitle("Import shows")
    .navigationBarTitleDisplayMode(.inline)
    .onChange(of: photos) { _, picked in
      guard !picked.isEmpty else { return }
      photos = []
      router.startImport(picked)
    }
    .fileImporter(isPresented: $pickingFile, allowedContentTypes: [.commaSeparatedText, .json]) { result in
      if case .success(let url) = result {
        model = MezzanineReviewModel(url: url)
        review = true
      } else if case .failure(let error) = result {
        model = MezzanineReviewModel()
        model.error = "Couldn’t open that file. Choose it again."
        review = true
      }
    }
    .navigationDestination(isPresented: $review) {
      MezzanineReviewView(model: model) { review = false; pickingFile = true }
    }
    .sheet(isPresented: $help) {
      NavigationStack {
        List {
          Text("Open Mezzanine, find its export option, and export your diary as a CSV or JSON file. Save the file, then choose it here.")
          Text("Your shows, theatres, dates, ratings and reviews can be imported. Private notes aren’t imported.").foregroundStyle(.secondary)
        }
        .navigationTitle("Export from Mezzanine")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { help = false } } }
      }
    }
  }

  nonisolated private func sourceRow(_ title: String, subtitle: String, symbol: String) -> some View {
    HStack {
      Image(systemName: symbol).foregroundStyle(Palette.tintText).frame(width: 24)
      VStack(alignment: .leading) {
        Text(title).foregroundStyle(Color.primary)
        Text(subtitle).font(.subheadline).foregroundStyle(Color.secondary)
      }
      Spacer()
      Image(systemName: "chevron.right").font(.footnote).foregroundStyle(.tertiary)
    }
    .frame(minHeight: 44).contentShape(Rectangle())
  }

}

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
          Label {
            VStack(alignment: .leading) {
              Text("Photos")
              Text("Pick photos from your shows. Stubbed sorts them by show.").font(.subheadline).foregroundStyle(.secondary)
            }
          } icon: { Image(systemName: "photo.stack") }
        }
        Button { pickingFile = true } label: {
          Label {
            VStack(alignment: .leading) {
              Text("Mezzanine export")
              Text("Bring over your Mezzanine diary from a CSV or JSON file.").font(.subheadline).foregroundStyle(.secondary)
            }
          } icon: { Image(systemName: "doc.badge.arrow.up") }
        }
      }
      Section {
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
        model.error = error.localizedDescription
        review = true
      }
    }
    .navigationDestination(isPresented: $review) {
      MezzanineReviewView(model: model) { review = false; pickingFile = true }
    }
    .sheet(isPresented: $help) {
      NavigationStack {
        List {
          Text("Open Mezzanine, find its export option, and export your diary as a CSV or JSON file. Save the file to Files, then choose it here.")
          Text("Your shows, theatres, dates, ratings and reviews can be imported. Private notes aren’t imported.").foregroundStyle(.secondary)
        }
        .navigationTitle("Export from Mezzanine")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { help = false } } }
      }
    }
  }
}

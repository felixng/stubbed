import PhotosUI
import SwiftUI

/// For someone who hasn't logged a show yet (#194): bring in the shows
/// they've already seen by picking photos, or track one by hand. Home and
/// Profile show it until the first show is logged.
struct ImportCallout: View {
  @Environment(AppRouter.self) private var router
  @State private var items: [PhotosPickerItem] = []

  var body: some View {
    VStack(alignment: .leading, spacing: Space.m) {
      Label {
        Text("Bring in the shows you’ve seen").font(.headline)
      } icon: {
        Image(systemName: "photo.stack").foregroundStyle(Palette.tint)
      }
      Text("Pick photos from shows you’ve been to: the curtain, the stage, the Playbill or your ticket. Stubbed sorts them by show and fills in what it can.")
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
      VStack(spacing: Space.s) {
        PhotosPicker(
          selection: $items, maxSelectionCount: PhotoImport.maxPhotos, selectionBehavior: .ordered,
          matching: .images
        ) {
          Text("Import from photos").frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .accessibilityHint("Pick photos from several shows and log each show in turn.")
        Button { router.startLog() } label: {
          Text("Log a show").frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
      }
      .controlSize(.large)
      .padding(.top, Space.xs)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .onChange(of: items) { _, picked in
      guard !picked.isEmpty else { return }
      items = []
      router.startImport(picked)
    }
  }
}

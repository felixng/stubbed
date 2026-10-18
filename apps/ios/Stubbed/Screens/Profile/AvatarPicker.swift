import PhotosUI
import SwiftUI

/// Tap the avatar to add or change the profile photo. Saves straight away,
/// on its own, so it works the same in onboarding and Edit profile. The
/// photo is cropped square and re-encoded on the device (dropping EXIF/GPS).
struct AvatarPicker: View {
  let userId: UUID
  let name: String
  @Binding var url: URL?
  var size: CGFloat = 88

  @State private var item: PhotosPickerItem?
  @State private var busy = false
  @State private var status: (ok: Bool, text: String)?

  var body: some View {
    VStack(spacing: Space.s) {
      PhotosPicker(selection: $item, matching: .images) {
        Avatar(name: name.isEmpty ? "?" : name, url: url, size: size)
          .overlay(alignment: .bottomTrailing) {
            Image(systemName: "camera.fill")
              .font(.footnote.weight(.semibold))
              .foregroundStyle(Palette.onTint)
              .frame(width: 32, height: 32)
              .background(Palette.tint, in: .circle)
              .overlay(Circle().strokeBorder(Color(.systemGroupedBackground), lineWidth: 2))
          }
          .opacity(busy ? 0.6 : 1)
      }
      .disabled(busy)
      .accessibilityLabel(url == nil ? "Add profile photo" : "Change profile photo")

      HStack(spacing: Space.l) {
        PhotosPicker(busy ? "Saving…" : url == nil ? "Add photo" : "Change photo", selection: $item, matching: .images)
          .disabled(busy)
        if url != nil, !busy {
          Button("Remove") { Task { await remove() } }
        }
      }
      .font(.subheadline.weight(.medium))

      if let status {
        Text(status.text)
          .font(.footnote)
          .foregroundStyle(status.ok ? Color.secondary : Color.red)
      }
    }
    .frame(maxWidth: .infinity)
    .onChange(of: item) { _, picked in
      guard let picked else { return }
      item = nil
      Task { await save(picked) }
    }
    .onChange(of: status?.text) { _, text in
      if let text { AccessibilityNotification.Announcement(text).post() }
    }
  }

  private func save(_ picked: PhotosPickerItem) async {
    status = nil
    busy = true
    defer { busy = false }
    guard let data = try? await picked.loadTransferable(type: Data.self) else {
      status = (false, "Couldn’t read that photo. Try another.")
      return
    }
    do {
      url = try await Avatars.save(data, userId: userId, replacing: url)
      status = (true, "Photo saved.")
    } catch Photo.Failure.unreadable {
      status = (false, "Couldn’t read that photo. Try another.")
    } catch {
      Log.data.error("Saving the avatar failed: \(error.localizedDescription, privacy: .public)")
      status = (false, "Couldn’t save the photo. Try again.")
    }
  }

  private func remove() async {
    status = nil
    busy = true
    defer { busy = false }
    do {
      try await Avatars.remove(userId: userId, current: url)
      url = nil
      status = (true, "Photo removed.")
    } catch {
      Log.data.error("Removing the avatar failed: \(error.localizedDescription, privacy: .public)")
      status = (false, "Couldn’t remove the photo. Try again.")
    }
  }
}

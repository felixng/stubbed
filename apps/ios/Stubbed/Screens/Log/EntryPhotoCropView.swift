import SwiftUI

struct EntryPhotoCropView: View {
  let image: CGImage
  let accept: (EntryPhotoCrop) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var crop: EntryPhotoCrop
  @GestureState private var translation = CGSize.zero
  @GestureState private var magnification: CGFloat = 1

  init(image: CGImage, initialCrop: EntryPhotoCrop? = nil, accept: @escaping (EntryPhotoCrop) -> Void) {
    self.image = image
    self.accept = accept
    _crop = State(initialValue: initialCrop ?? .centered(in: CGSize(width: image.width, height: image.height)))
  }

  private var source: CGSize { CGSize(width: image.width, height: image.height) }

  var body: some View {
    NavigationStack {
      ScrollView {
        GeometryReader { proxy in
          let edge = proxy.size.width
          let proposed = adjusted(translation: translation, magnification: magnification, edge: edge)
          let scale = edge / proposed.side
          Image(decorative: image, scale: 1)
            .resizable()
            .frame(width: source.width * scale, height: source.height * scale)
            .position(x: (source.width / 2 - proposed.origin.x) * scale,
                      y: (source.height / 2 - proposed.origin.y) * scale)
            .frame(width: edge, height: edge)
            .clipped()
            .contentShape(Rectangle())
            .gesture(DragGesture()
              .updating($translation) { value, state, _ in state = value.translation }
              .onEnded { crop = adjusted(translation: $0.translation, magnification: 1, edge: edge) })
            .simultaneousGesture(MagnifyGesture()
              .updating($magnification) { value, state, _ in state = value.magnification }
              .onEnded { crop = adjusted(translation: .zero, magnification: $0.magnification, edge: edge) })
            .accessibilityLabel("Square photo preview")
        }
        .aspectRatio(1, contentMode: .fit)

        HStack {
          Button("Zoom out", systemImage: "minus.magnifyingglass") { zoom(0.8) }
          Spacer()
          Button("Reset") { crop = .centered(in: source) }
          Spacer()
          Button("Zoom in", systemImage: "plus.magnifyingglass") { zoom(1.25) }
        }
        .labelStyle(.iconOnly)
        .padding(.vertical)
      }
      .padding()
      .navigationTitle("Crop photo")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Use photo") {
            accept(crop)
            dismiss()
          }
        }
      }
    }
  }

  private func zoom(_ factor: CGFloat) {
    crop = EntryPhotoCrop(center: crop.center, side: crop.side / factor, source: source)
  }

  private func adjusted(translation: CGSize, magnification: CGFloat, edge: CGFloat) -> EntryPhotoCrop {
    let ratio = crop.side / max(1, edge)
    let center = CGPoint(x: crop.center.x - translation.width * ratio, y: crop.center.y - translation.height * ratio)
    return EntryPhotoCrop(center: center, side: crop.side / magnification, source: source)
  }
}

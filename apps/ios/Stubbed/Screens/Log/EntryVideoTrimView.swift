import AVKit
import SwiftUI

struct EntryVideoTrimView: View {
  let source: URL
  let onUse: (URL) -> Void
  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var scenePhase
  @State private var player: AVPlayer?
  @State private var duration = 0.0
  @State private var start = 0.0
  @State private var end = 0.0
  @State private var error: String?
  @State private var export: Task<Void, Never>?

  private var minimumLength: Double { min(0.1, duration) }
  private var startLimit: Double { max(0, duration - minimumLength) }

  var body: some View {
    NavigationStack {
      VStack(spacing: 16) {
        if let player {
          VideoPlayer(player: player)
            .aspectRatio(1, contentMode: .fit)
        }
        if duration > 0 {
          if startLimit > 0 {
            Slider(value: Binding(get: { start }, set: setStart), in: 0...startLimit)
              .accessibilityLabel("Trim start")
              .accessibilityValue(start.formatted(.number.precision(.fractionLength(2))) + " seconds")
              .disabled(export != nil)
          }
          let minimumEnd = min(duration, start + minimumLength)
          let maximumEnd = min(duration, start + 30)
          if maximumEnd > minimumEnd {
            Slider(value: Binding(get: { end }, set: setEnd), in: minimumEnd...maximumEnd)
              .accessibilityLabel("Trim end")
              .accessibilityValue(end.formatted(.number.precision(.fractionLength(2))) + " seconds")
              .disabled(export != nil)
          }
          Text("\((end - start).formatted(.number.precision(.fractionLength(2)))) seconds selected")
            .monospacedDigit()
        }
        if export != nil { ProgressView("Preparing video…") }
        if let error { Text(error).foregroundStyle(.secondary) }
      }
      .padding()
      .navigationTitle("Trim video")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") {
            export?.cancel()
            dismiss()
          }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Use video", action: beginExport)
            .disabled(duration <= 0 || export != nil)
        }
      }
    }
    .task {
      do {
        let asset = AVURLAsset(url: source)
        let seconds = try await asset.load(.duration).seconds
        guard seconds.isFinite, seconds > 0 else { throw CocoaError(.fileReadCorruptFile) }
        try Task.checkCancellation()
        duration = seconds
        end = min(seconds, 30)
        let preview = AVPlayer(playerItem: AVPlayerItem(asset: asset))
        preview.isMuted = true
        player = preview
        setEnd(end)
      } catch is CancellationError {
      } catch {
        self.error = "This video couldn’t be opened."
      }
    }
    .onDisappear {
      player?.pause()
      export?.cancel()
    }
    .onChange(of: scenePhase) { _, phase in
      if phase != .active { player?.pause() }
    }
  }

  private func setStart(_ value: Double) {
    start = value
    setEnd(max(min(duration, start + minimumLength), min(end, start + 30)))
    player?.seek(to: CMTime(seconds: start, preferredTimescale: 600))
  }

  private func setEnd(_ value: Double) {
    end = value
    player?.currentItem?.forwardPlaybackEndTime = CMTime(seconds: end, preferredTimescale: 600)
  }

  private func beginExport() {
    player?.pause()
    error = nil
    export = Task {
      defer { export = nil }
      do {
        let clip = try await EntryVideoExport.makeClip(from: source, start: start, end: end)
        if Task.isCancelled {
          try? FileManager.default.removeItem(at: clip)
          return
        }
        onUse(clip)
        dismiss()
      } catch is CancellationError {
      } catch {
        self.error = "This clip couldn’t be prepared. Try a shorter selection."
      }
    }
  }
}

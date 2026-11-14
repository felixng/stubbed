import AVFoundation
import CoreTransferable
import Foundation
import UniformTypeIdentifiers

struct EntryVideoSource: Transferable, Sendable {
  let url: URL

  static var transferRepresentation: some TransferRepresentation {
    FileRepresentation(importedContentType: .movie) { received in
      let destination = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString)
        .appendingPathExtension(received.file.pathExtension)
      try FileManager.default.copyItem(at: received.file, to: destination)
      return Self(url: destination)
    }
  }
}

enum EntryVideoExport {
  static func makeClip(from source: URL, start: Double, end: Double) async throws -> URL {
    guard start.isFinite, end.isFinite, start >= 0, end > start, end - start <= 30 else {
      throw CocoaError(.featureUnsupported)
    }
    let asset = AVURLAsset(url: source)
    let sourceDuration = try await asset.load(.duration).seconds
    guard sourceDuration.isFinite, end <= sourceDuration else { throw CocoaError(.fileReadCorruptFile) }
    let output = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".mp4")
    var duration = end - start
    do {
      for attempt in 0..<2 {
        try Task.checkCancellation()
        let range = CMTimeRange(
          start: CMTime(seconds: start, preferredTimescale: 60_000),
          duration: CMTime(seconds: duration, preferredTimescale: 60_000)
        )
        try await exportControlledVideo(asset, to: output, range: range)
        let measured = try await packetEnd(of: output)
        let bytes = try output.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard bytes > 0, bytes <= 15 * 1024 * 1024 else { throw CocoaError(.fileWriteOutOfSpace) }
        if measured > 0, measured <= 30 { return output }
        guard attempt == 0, measured > 30 else { throw CocoaError(.fileReadCorruptFile) }
        duration -= measured - 30 + 0.05
        guard duration > 0 else { throw CocoaError(.fileReadCorruptFile) }
        try FileManager.default.removeItem(at: output)
      }
      throw CocoaError(.fileReadCorruptFile)
    } catch {
      try? FileManager.default.removeItem(at: output)
      throw error
    }
  }

  private static func packetEnd(of url: URL) async throws -> Double {
    let asset = AVURLAsset(url: url)
    let reader = try AVAssetReader(asset: asset)
    let tracks = try await asset.loadTracks(withMediaType: .video) + asset.loadTracks(withMediaType: .audio)
    let outputs = try tracks.map { track in
      let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
      output.alwaysCopiesSampleData = false
      guard reader.canAdd(output) else { throw CocoaError(.featureUnsupported) }
      reader.add(output)
      return output
    }
    guard reader.startReading() else { throw reader.error ?? CocoaError(.fileReadCorruptFile) }
    defer { if reader.status == .reading { reader.cancelReading() } }
    var end = CMTime.zero
    for output in outputs {
      while let sample = output.copyNextSampleBuffer() {
        try Task.checkCancellation()
        for timing in try sample.sampleTimingInfos() {
          let sampleEnd = timing.presentationTimeStamp + timing.duration
          guard sampleEnd.isNumeric else { throw CocoaError(.fileReadCorruptFile) }
          end = max(end, sampleEnd)
        }
      }
    }
    guard reader.status == .completed else { throw reader.error ?? CocoaError(.fileReadCorruptFile) }
    return end.seconds
  }
}

private func exportControlledVideo(_ asset: AVURLAsset, to output: URL, range: CMTimeRange) async throws {
  guard let track = try await asset.loadTracks(withMediaType: .video).first else {
    throw CocoaError(.featureUnsupported)
  }
  let size = try await track.load(.naturalSize)
  let transform = try await track.load(.preferredTransform)
  let bounds = CGRect(origin: .zero, size: size).applying(transform)
  let scale = min(1, 1280 / max(bounds.width, bounds.height), 720 / min(bounds.width, bounds.height))
  let width = Int(bounds.width * scale / 2) * 2
  let height = Int(bounds.height * scale / 2) * 2
  guard width > 0, height > 0 else { throw CocoaError(.featureUnsupported) }
  let reader = try AVAssetReader(asset: asset)
  reader.timeRange = range
  let pixelSettings = [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
  ]
  let readerOutput: AVAssetReaderOutput
  if transform.isIdentity, size.width == CGFloat(width), size.height == CGFloat(height) {
    readerOutput = AVAssetReaderTrackOutput(track: track, outputSettings: pixelSettings)
  } else {
    let composition = AVMutableVideoComposition()
    composition.colorPrimaries = AVVideoColorPrimaries_ITU_R_709_2
    composition.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
    composition.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2
    composition.renderSize = CGSize(width: width, height: height)
    composition.frameDuration = CMTime(value: 1, timescale: 30)
    let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
    let fit = transform
      .concatenating(CGAffineTransform(translationX: -bounds.minX, y: -bounds.minY))
      .concatenating(CGAffineTransform(scaleX: scale, y: scale))
    layer.setTransform(fit, at: .zero)
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: try await asset.load(.duration))
    instruction.layerInstructions = [layer]
    composition.instructions = [instruction]
    let composed = AVAssetReaderVideoCompositionOutput(videoTracks: [track], videoSettings: pixelSettings)
    composed.videoComposition = composition
    readerOutput = composed
  }
  readerOutput.alwaysCopiesSampleData = false
  let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
  let writerInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: [
      AVVideoAverageBitRateKey: 3_000_000,
      AVVideoAllowFrameReorderingKey: false,
    ],
  ])
  guard reader.canAdd(readerOutput), writer.canAdd(writerInput) else {
    throw CocoaError(.featureUnsupported)
  }
  reader.add(readerOutput)
  writer.add(writerInput)
  var audioOutput: AVAssetReaderTrackOutput?
  var audioInput: AVAssetWriterInput?
  if let audioTrack = try await asset.loadTracks(withMediaType: .audio).first {
    let pcm = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
    ])
    let aac = AVAssetWriterInput(mediaType: .audio, outputSettings: [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVNumberOfChannelsKey: 2,
      AVSampleRateKey: 48_000,
      AVEncoderBitRateKey: 96_000,
    ])
    guard reader.canAdd(pcm), writer.canAdd(aac) else { throw CocoaError(.featureUnsupported) }
    reader.add(pcm)
    writer.add(aac)
    audioOutput = pcm
    audioInput = aac
  }
  defer {
    if reader.status == .reading { reader.cancelReading() }
    if writer.status == .writing { writer.cancelWriting() }
  }
  guard reader.startReading() else { throw reader.error ?? CocoaError(.fileReadCorruptFile) }
  guard writer.startWriting() else { throw writer.error ?? CocoaError(.fileWriteUnknown) }
  writer.startSession(atSourceTime: range.start)
  var videoSample = readerOutput.copyNextSampleBuffer()
  var audioSample = audioOutput?.copyNextSampleBuffer()
  if videoSample == nil { writerInput.markAsFinished() }
  if audioSample == nil { audioInput?.markAsFinished() }
  while videoSample != nil || audioSample != nil {
    try Task.checkCancellation()
    var progressed = false
    if let sample = videoSample, writerInput.isReadyForMoreMediaData {
      guard writerInput.append(sample) else { throw writer.error ?? CocoaError(.fileWriteUnknown) }
      videoSample = readerOutput.copyNextSampleBuffer()
      if videoSample == nil { writerInput.markAsFinished() }
      progressed = true
    }
    if let sample = audioSample, let audioInput, audioInput.isReadyForMoreMediaData {
      guard audioInput.append(sample) else { throw writer.error ?? CocoaError(.fileWriteUnknown) }
      audioSample = audioOutput?.copyNextSampleBuffer()
      if audioSample == nil { audioInput.markAsFinished() }
      progressed = true
    }
    if !progressed {
      if writer.status != .writing { throw writer.error ?? CocoaError(.fileWriteUnknown) }
      try await Task.sleep(for: .milliseconds(2))
    }
  }
  guard reader.status == .completed else { throw reader.error ?? CocoaError(.fileReadCorruptFile) }
  writer.endSession(atSourceTime: range.end)
  await writer.finishWriting()
  guard writer.status == .completed else { throw writer.error ?? CocoaError(.fileWriteUnknown) }
}

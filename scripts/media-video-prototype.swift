import AVFoundation
import CoreVideo
import Foundation

func fixture(_ url: URL) async throws {
  let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
  let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 1280, AVVideoHeightKey: 720,
  ])
  let pixels = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: 1280, kCVPixelBufferHeightKey as String: 720,
  ])
  writer.add(input)
  guard writer.startWriting() else { throw writer.error ?? CocoaError(.fileWriteUnknown) }
  writer.startSession(atSourceTime: .zero)
  for frame in 0..<960 {
    while !input.isReadyForMoreMediaData {
      if let error = writer.error { throw error }
      try await Task.sleep(for: .milliseconds(2))
    }
    var buffer: CVPixelBuffer?
    guard let pool = pixels.pixelBufferPool,
      CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer) == kCVReturnSuccess,
      let buffer else { throw CocoaError(.fileWriteUnknown) }
    CVPixelBufferLockBaseAddress(buffer, [])
    if let address = CVPixelBufferGetBaseAddress(buffer) {
      memset(address, Int32(frame % 200 + 20), CVPixelBufferGetDataSize(buffer))
    }
    CVPixelBufferUnlockBaseAddress(buffer, [])
    guard pixels.append(buffer, withPresentationTime: CMTime(value: Int64(frame), timescale: 30))
    else { throw writer.error ?? CocoaError(.fileWriteUnknown) }
  }
  input.markAsFinished()
  await writer.finishWriting()
  if let error = writer.error { throw error }
}

// This probe measures bitrate control for a silent, upright SDR source.
func exportControlledVideo(_ asset: AVURLAsset, to output: URL, range: CMTimeRange) async throws {
  guard let track = try await asset.loadTracks(withMediaType: .video).first,
        try await asset.loadTracks(withMediaType: .audio).isEmpty,
        try await track.load(.preferredTransform).isIdentity else {
    throw CocoaError(.featureUnsupported)
  }
  let size = try await track.load(.naturalSize)
  let scale = min(1, 1280 / max(size.width, size.height), 720 / min(size.width, size.height))
  let width = Int(size.width * scale / 2) * 2
  let height = Int(size.height * scale / 2) * 2
  let reader = try AVAssetReader(asset: asset)
  reader.timeRange = range
  let readerOutput = AVAssetReaderTrackOutput(track: track, outputSettings: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
  ])
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
  defer {
    if reader.status == .reading { reader.cancelReading() }
    if writer.status == .writing { writer.cancelWriting() }
  }
  guard reader.startReading() else { throw reader.error ?? CocoaError(.fileReadCorruptFile) }
  guard writer.startWriting() else { throw writer.error ?? CocoaError(.fileWriteUnknown) }
  writer.startSession(atSourceTime: range.start)
  while let sample = readerOutput.copyNextSampleBuffer() {
    while !writerInput.isReadyForMoreMediaData {
      if writer.status != .writing { throw writer.error ?? CocoaError(.fileWriteUnknown) }
      try await Task.sleep(for: .milliseconds(2))
    }
    guard writerInput.append(sample) else { throw writer.error ?? CocoaError(.fileWriteUnknown) }
  }
  guard reader.status == .completed else { throw reader.error ?? CocoaError(.fileReadCorruptFile) }
  writer.endSession(atSourceTime: range.end)
  writerInput.markAsFinished()
  await writer.finishWriting()
  guard writer.status == .completed else { throw writer.error ?? CocoaError(.fileWriteUnknown) }
}

let arguments = Array(CommandLine.arguments.dropFirst())
guard let outputPath = arguments.first else {
  throw CocoaError(.fileNoSuchFile)
}
let directory = URL(filePath: outputPath, directoryHint: .isDirectory)
let sourceIndex = arguments.firstIndex(of: "--source")
let original: URL
if let sourceIndex {
  guard arguments.indices.contains(sourceIndex + 1) else { throw CocoaError(.fileNoSuchFile) }
  original = URL(filePath: arguments[sourceIndex + 1])
} else {
  original = directory.appending(path: "original.mp4")
  try? FileManager.default.removeItem(at: original)
  try await fixture(original)
}
if sourceIndex == nil, arguments.count > 1, arguments[1] != "--controlled" {
  let audio = AVURLAsset(url: URL(filePath: arguments[1]))
  let video = AVURLAsset(url: original)
  let composition = AVMutableComposition()
  let videoTrack = try await video.loadTracks(withMediaType: .video).first!
  let audioTrack = try await audio.loadTracks(withMediaType: .audio).first!
  let duration = min(try await video.load(.duration), try await audio.load(.duration))
  let range = CMTimeRange(start: .zero, duration: duration)
  try composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
    .insertTimeRange(range, of: videoTrack, at: .zero)
  try composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
    .insertTimeRange(range, of: audioTrack, at: .zero)
  let output = directory.appending(path: "original-audio.mp4")
  try? FileManager.default.removeItem(at: output)
  guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPreset1280x720)
  else { throw CocoaError(.fileWriteUnknown) }
  export.metadata = []
  try await export.export(to: output, as: .mp4)
}
for length in [29.95, 29.9, 30.0, 30.1] {
  let input = AVURLAsset(url: original)
  let output = directory.appending(path: "trim-\(length).mp4")
  try? FileManager.default.removeItem(at: output)
  let range = CMTimeRange(start: CMTime(value: 1, timescale: 1),
    duration: CMTime(seconds: length, preferredTimescale: 600))
  let start = Date()
  if arguments.contains("--controlled") {
    try await exportControlledVideo(input, to: output, range: range)
  } else {
    guard let export = AVAssetExportSession(asset: input, presetName: AVAssetExportPreset1280x720)
    else { throw CocoaError(.fileWriteUnknown) }
    export.metadata = []
    export.timeRange = range
    try await export.export(to: output, as: .mp4)
  }
  let exported = AVURLAsset(url: output)
  let duration = try await exported.load(.duration).seconds
  let bytes = try output.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
  print("requested=\(length) duration=\(duration) bytes=\(bytes) export_seconds=\(Date().timeIntervalSince(start))")
}

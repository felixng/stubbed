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

// The prototype uses an SDR video composition when the source needs rotation or scaling.
func exportControlledVideo(_ asset: AVURLAsset, to output: URL, range: CMTimeRange) async throws {
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
if sourceIndex == nil, arguments.count > 1, !arguments[1].hasPrefix("--") {
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
let lengths: [Double]
if let lengthIndex = arguments.firstIndex(of: "--length") {
  guard arguments.indices.contains(lengthIndex + 1),
        let length = Double(arguments[lengthIndex + 1]), length.isFinite, length > 0 else {
    throw CocoaError(.fileReadUnknown)
  }
  lengths = [length]
} else {
  lengths = [29.95, 29.9, 30.0, 30.1]
}
for length in lengths {
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

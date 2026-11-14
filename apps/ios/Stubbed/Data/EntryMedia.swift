import AVFoundation
import Foundation
import UIKit
import Supabase

enum EntryMedia {
  static let bucket = "entry-media"

  struct PhotoDraft {
    let requestID = UUID()
    let source: Data
    let display: Data
    let thumbnail: Data
    let rectangle: [Double]
    var recrop = false
    var replacing: UUID? = nil
  }

  struct Cover: Decodable {
    let media_id: UUID
    let photo_path: String
    let legacy: Bool
  }

  private struct Asset: Encodable {
    let role: String
    var content_type = "image/jpeg"
    let bytes: Int
  }

  private struct Request: Encodable {
    let p_entry_id: UUID
    let p_request_id: UUID
    var p_kind = "photo"
    let p_replace_media_id: UUID?
    let p_assets: [Asset]

    func encode(to encoder: Encoder) throws {
      var values = encoder.container(keyedBy: CodingKeys.self)
      try values.encode(p_entry_id, forKey: .p_entry_id)
      try values.encode(p_request_id, forKey: .p_request_id)
      try values.encode(p_kind, forKey: .p_kind)
      try values.encode(p_replace_media_id, forKey: .p_replace_media_id)
      try values.encode(p_assets, forKey: .p_assets)
    }

    private enum CodingKeys: String, CodingKey {
      case p_entry_id, p_request_id, p_kind, p_replace_media_id, p_assets
    }
  }

  private struct Lease: Decodable {
    let reservation_id: UUID
    let state: String
    let paths: [String: String]
  }

  private struct Completion: Encodable {
    let reservation_id: UUID
    let crop: [Double]
  }

  private struct Result: Decodable {
    let media_id: UUID
  }

  static func cover(entryID: UUID) async throws -> Cover? {
    let rows: [Cover] = try await supabase.from("entry_media_covers")
      .select("media_id,photo_path,legacy").eq("entry_id", value: entryID).limit(1).execute().value
    return rows.first
  }

  struct GalleryItem: Identifiable, Sendable {
    let id: UUID
    let url: URL
    let video: URL?
  }

  static func galleryItems(entryID: UUID) async throws -> [GalleryItem] {
    struct Row: Decodable {
      let id: UUID
      let display_path: String
      let legacy: Bool
      let kind: String
      let poster_path: String?
    }
    let rows: [Row] = try await supabase.from("entry_media").select("id,display_path,legacy,kind,poster_path")
      .eq("entry_id", value: entryID).eq("state", value: "ready")
      .order("position").execute().value
    let nativePaths = rows.filter { !$0.legacy }.compactMap { $0.kind == "video" ? $0.poster_path : $0.display_path }
    let legacy = await Entries.signPhotos(rows.filter(\.legacy).map(\.display_path))
    var native: [String: URL] = [:]
    if !nativePaths.isEmpty {
      let signed = try await supabase.storage.from(bucket).createSignedURLs(paths: nativePaths, expiresIn: 3600)
      for result in signed {
        if case .success(let path, let url) = result { native[path] = url }
      }
    }
    let videoPaths = rows.filter { $0.kind == "video" }.map(\.display_path)
    var videos: [String: URL] = [:]
    if !videoPaths.isEmpty, let signed = try? await supabase.storage.from("entry-video")
      .createSignedURLs(paths: videoPaths, expiresIn: 3600) {
      for result in signed {
        if case .success(let path, let url) = result { videos[path] = url }
      }
    }
    return rows.compactMap { row in
      let path = row.poster_path ?? row.display_path
      let url = row.legacy ? legacy[path] : native[path]
      return url.map { GalleryItem(id: row.id, url: $0, video: videos[row.display_path]) }
    }
  }

  static func reorder(entryID: UUID, mediaIDs: [UUID]) async throws {
    struct Order: Encodable {
      let p_entry_id: UUID
      let p_media_ids: [UUID]
    }
    try await supabase.rpc("reorder_entry_media", params: Order(p_entry_id: entryID, p_media_ids: mediaIDs)).execute()
  }

  static func remove(entryID: UUID, mediaID: UUID) async throws {
    try await supabase.rpc("delete_entry_media", params: [
      "p_entry_id": entryID, "p_media_id": mediaID,
    ]).execute()
  }

  struct RetainedPhoto {
    let data: Data
    let rectangle: [Double]
  }

  static func retainedPhoto(entryID: UUID, mediaID: UUID) async throws -> RetainedPhoto {
    struct Source: Decodable { let source_revision: Int }
    struct Geometry: Decodable {
      let crop_x: Double
      let crop_y: Double
      let crop_width: Double
      let crop_height: Double
    }
    async let source: Source = supabase.from("entry_media_sources").select("source_revision")
      .eq("media_id", value: mediaID).single().execute().value
    async let geometry: Geometry = supabase.from("entry_media").select("crop_x,crop_y,crop_width,crop_height")
      .eq("id", value: mediaID).single().execute().value
    let (retained, crop) = try await (source, geometry)
    let path = "\(entryID.uuidString.lowercased())/\(mediaID.uuidString.lowercased())/\(retained.source_revision)/source.jpg"
    let data = try await supabase.storage.from(bucket).download(path: path)
    return RetainedPhoto(data: data, rectangle: [crop.crop_x, crop.crop_y, crop.crop_width, crop.crop_height])
  }

  struct VideoDraft {
    let requestID = UUID()
    let file: URL
    var uploadLocation: URL?
  }

  static func saveVideo(_ video: inout VideoDraft, entryID: UUID) async throws {
    struct VideoCompletion: Encodable { let reservation_id: UUID }
    let bytes = try video.file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    guard bytes > 0, bytes <= 15 * 1024 * 1024 else { throw CocoaError(.fileReadCorruptFile) }
    let generator = AVAssetImageGenerator(asset: AVURLAsset(url: video.file))
    generator.maximumSize = CGSize(width: 1024, height: 1024)
    generator.appliesPreferredTrackTransform = true
    let frame = try await generator.image(at: .zero).image
    let derivatives = try [("poster", 1024), ("thumb", 256)].map { role, limit in
      let edge = min(frame.width, frame.height)
      guard let crop = frame.cropping(to: CGRect(x: (frame.width - edge) / 2,
        y: (frame.height - edge) / 2, width: edge, height: edge)) else { throw Photo.Failure.unreadable }
      let size = CGSize(width: min(edge, limit), height: min(edge, limit))
      let format = UIGraphicsImageRendererFormat()
      format.scale = 1
      let data = UIGraphicsImageRenderer(size: size, format: format).jpegData(withCompressionQuality: 0.8) {
        _ in UIImage(cgImage: crop).draw(in: CGRect(origin: .zero, size: size))
      }
      return (role, data)
    }
    let lease: Lease = try await supabase.rpc("reserve_entry_media", params: Request(
      p_entry_id: entryID, p_request_id: video.requestID, p_kind: "video", p_replace_media_id: nil,
      p_assets: [Asset(role: "display", content_type: "video/mp4", bytes: bytes)]
        + derivatives.map { Asset(role: $0.0, bytes: $0.1.count) }
    )).execute().value
    guard lease.state != "finalized" else { return }
    guard let path = lease.paths["display"] else { throw Photo.Failure.unreadable }
    let token = try await supabase.auth.session.accessToken
    try await EntryVideoUpload.upload(file: video.file, bytes: bytes, path: path,
      token: token, location: &video.uploadLocation)
    for (role, data) in derivatives {
      guard let path = lease.paths[role] else { throw Photo.Failure.unreadable }
      do {
        try await supabase.storage.from(bucket).upload(path, data: data,
          options: FileOptions(contentType: "image/jpeg", upsert: false))
      } catch let error as StorageError where error.statusCode == "409" {
        // Retry reuses the already uploaded immutable derivative.
      }
    }
    let _: Result = try await supabase.functions.invoke("entry-media-finalize",
      options: FunctionInvokeOptions(body: VideoCompletion(reservation_id: lease.reservation_id)))
  }

  static func savePhoto(_ photo: PhotoDraft, entryID: UUID) async throws {
    var files = [("display", photo.display), ("thumb", photo.thumbnail)]
    if !photo.recrop { files.append(("source", photo.source)) }
    let lease: Lease = try await supabase.rpc("reserve_entry_media", params: Request(
      p_entry_id: entryID, p_request_id: photo.requestID, p_replace_media_id: photo.replacing,
      p_assets: files.map { Asset(role: $0.0, bytes: $0.1.count) }
    )).execute().value
    guard lease.state != "finalized" else { return }

    for (role, data) in files {
      guard let path = lease.paths[role] else { throw Photo.Failure.unreadable }
      do {
        try await supabase.storage.from(bucket).upload(path, data: data,
          options: FileOptions(cacheControl: "3600", contentType: "image/jpeg", upsert: false))
      } catch let error as StorageError where error.statusCode == "409" {
        // A prior attempt already wrote this immutable reservation object.
      }
    }
    let _: Result = try await supabase.functions.invoke("entry-media-finalize",
      options: FunctionInvokeOptions(body: Completion(reservation_id: lease.reservation_id, crop: photo.rectangle)))
  }
}

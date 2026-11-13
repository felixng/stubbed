import Foundation
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
    let content_type = "image/jpeg"
    let bytes: Int
  }

  private struct Request: Encodable {
    let p_entry_id: UUID
    let p_request_id: UUID
    let p_kind = "photo"
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

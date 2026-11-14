import Foundation

enum EntryVideoUpload {
  private static let chunkSize = 6 * 1024 * 1024

  static func upload(file: URL, bytes: Int, path: String, token: String, location: inout URL?) async throws {
    let origin = AppConfig.current.supabaseURL
    let endpoint = origin.appendingPathComponent("storage/v1/upload/resumable")
    func request(_ url: URL, method: String) -> URLRequest {
      var request = URLRequest(url: url)
      request.httpMethod = method
      request.setValue("1.0.0", forHTTPHeaderField: "Tus-Resumable")
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      request.setValue(AppConfig.current.supabasePublishableKey, forHTTPHeaderField: "apikey")
      return request
    }
    func send(_ request: URLRequest) async throws -> HTTPURLResponse {
      let (_, response) = try await URLSession.shared.data(for: request)
      guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
      return response
    }
    var offset = 0
    if let previous = location {
      let response = try await send(request(previous, method: "HEAD"))
      if response.statusCode == 404 || response.statusCode == 410 {
        location = nil
      } else {
        guard response.statusCode == 200 || response.statusCode == 204,
              let confirmed = Int(response.value(forHTTPHeaderField: "Upload-Offset") ?? ""),
              (0...bytes).contains(confirmed) else { throw URLError(.badServerResponse) }
        offset = confirmed
      }
    }
    if location == nil {
      var create = request(endpoint, method: "POST")
      let metadata = [("bucketName", "entry-video"), ("objectName", path), ("contentType", "video/mp4")]
        .map { "\($0.0) \(Data($0.1.utf8).base64EncodedString())" }.joined(separator: ",")
      create.setValue(metadata, forHTTPHeaderField: "Upload-Metadata")
      create.setValue(String(bytes), forHTTPHeaderField: "Upload-Length")
      let response = try await send(create)
      guard response.statusCode == 201,
            let value = response.value(forHTTPHeaderField: "Location"),
            let upload = URL(string: value, relativeTo: endpoint)?.absoluteURL,
            upload.scheme == endpoint.scheme, upload.host == endpoint.host, upload.port == endpoint.port,
            upload.path.hasPrefix(endpoint.path + "/") else { throw URLError(.badServerResponse) }
      location = upload
    }
    guard let upload = location else { throw URLError(.badServerResponse) }
    let handle = try FileHandle(forReadingFrom: file)
    defer { try? handle.close() }
    try handle.seek(toOffset: UInt64(offset))
    while offset < bytes {
      try Task.checkCancellation()
      let length = min(chunkSize, bytes - offset)
      guard let data = try handle.read(upToCount: length), data.count == length else {
        throw CocoaError(.fileReadCorruptFile)
      }
      var patch = request(upload, method: "PATCH")
      patch.setValue(String(offset), forHTTPHeaderField: "Upload-Offset")
      patch.setValue("application/offset+octet-stream", forHTTPHeaderField: "Content-Type")
      patch.httpBody = data
      let response = try await send(patch)
      guard response.statusCode == 204,
            Int(response.value(forHTTPHeaderField: "Upload-Offset") ?? "") == offset + length else {
        throw URLError(.badServerResponse)
      }
      offset += length
    }
  }
}

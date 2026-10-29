import UIKit

/// Straight into Instagram's story composer with the card (#129), as Meta's
/// "Sharing to Stories" docs describe: the card goes on the pasteboard as a
/// sticker, then `instagram-stories://share` opens Instagram. Needs Meta's
/// app ID (`FACEBOOK_APP_ID` in Config/*.xcconfig) and Instagram installed;
/// otherwise the share screen falls back to the share sheet.
enum InstagramStories {
  @MainActor static var url: URL? {
    guard let appID = AppConfig.current.facebookAppID,
      let url = URL(string: "instagram-stories://share?source_application=\(appID)"),
      UIApplication.shared.canOpenURL(url)
    else { return nil }
    return url
  }

  /// Opens Instagram with the card as a sticker. A card with its background
  /// sits on a dark backdrop that matches the cards; one without lets
  /// Instagram pick. False if Instagram can't be opened.
  @MainActor static func share(_ card: UIImage, transparent: Bool) async -> Bool {
    guard let url, let appID = AppConfig.current.facebookAppID, let png = card.pngData() else { return false }
    var item: [String: Any] = [
      "com.instagram.sharedSticker.stickerImage": png,
      "com.instagram.sharedSticker.appID": appID,
    ]
    if !transparent {
      item["com.instagram.sharedSticker.backgroundTopColor"] = "#1C1C1E"
      item["com.instagram.sharedSticker.backgroundBottomColor"] = "#3A1418"
    }
    // Instagram reads it at once; don't leave the card on the pasteboard.
    UIPasteboard.general.setItems([item], options: [.expirationDate: Date().addingTimeInterval(5 * 60)])
    return await UIApplication.shared.open(url)
  }
}

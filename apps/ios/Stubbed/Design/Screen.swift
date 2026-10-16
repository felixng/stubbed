import SwiftUI

/// A scrolling screen on the system grouped background, with a large
/// navigation title. Content sits in a column with 16pt margins, capped for
/// wide screens.
struct Screen<Content: View>: View {
  let title: String
  var spacing: CGFloat = Space.l
  @ViewBuilder var content: Content

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: spacing) {
        content
      }
      .frame(maxWidth: 640)
      .padding(.horizontal, Space.l)
      .padding(.top, Space.s)
      .padding(.bottom, Space.xl)
      .frame(maxWidth: .infinity)
    }
    .background(Color(.systemGroupedBackground))
    .navigationTitle(title)
    .navigationBarTitleDisplayMode(.large)
  }
}

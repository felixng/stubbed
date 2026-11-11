import Charts
import StoreKit
import SwiftUI

/// The one paywall: what the paid tier adds and the offer the provider returns. Opened only
/// through `PaywallRouter.present`, which also decides where to go back to.
struct PaywallView: View {
  let source: PaywallRouter.Source
  @Environment(Membership.self) private var membership
  @Environment(PaywallRouter.self) private var paywall
  @Environment(\.dismiss) private var dismiss
  @State private var selected: String?

  /// An illustration, not the member's data: labelled "Example" and hidden from VoiceOver.
  private static let sample: [(label: String, share: Int, color: Color)] = [
    ("Musicals", 58, Palette.tint), ("Plays", 27, Color.primary),
    ("Opera", 10, Color.gray), ("Other", 5, Color(.systemFill)),
  ]

  /// What Show mix looks like: one stacked bar and its legend, drawn with Swift Charts.
  private var sampleMix: some View {
    VStack(alignment: .leading, spacing: Space.m) {
      HStack {
        Text("Show mix").font(.headline)
        Spacer()
        Text("Example").font(.footnote).foregroundStyle(.secondary)
      }
      Chart(Self.sample, id: \.label) { item in
        BarMark(x: .value("Share", item.share), y: .value("Mix", ""))
          .foregroundStyle(item.color)
      }
      .chartXScale(domain: 0...100)
      .chartXAxis(.hidden)
      .chartYAxis(.hidden)
      .chartLegend(.hidden)
      .frame(height: 14)
      .clipShape(Capsule())
      Grid(alignment: .leading, horizontalSpacing: Space.xl, verticalSpacing: Space.xs) {
        GridRow {
          legend(Self.sample[0]); legend(Self.sample[1])
        }
        GridRow {
          legend(Self.sample[2]); legend(Self.sample[3])
        }
      }
    }
    .padding(.vertical, Space.xs)
    .accessibilityHidden(true)
  }

  private func legend(_ item: (label: String, share: Int, color: Color)) -> some View {
    HStack(spacing: Space.s) {
      Circle().fill(item.color).frame(width: 10, height: 10)
      Text(item.label).font(.footnote).foregroundStyle(.secondary)
      Spacer(minLength: Space.xs)
      Text("\(item.share)%").font(.footnote).monospacedDigit()
    }
  }

  private var flow: PurchaseFlow { paywall.flow }
  private var offer: PaywallOffer { paywall.offer }
  private var chosen: String? { selected ?? offer.plans.last?.id }

  var body: some View {
    NavigationStack {
      List {
        Section {
          VStack(alignment: .leading, spacing: Space.s) {
            Text("Look back at every year").font(.title.bold())
            Text(
              "\(membership.name) adds Show mix, earlier years and All time stats. Logging, your diary, trips and sharing stay free."
            )
            .font(.body).foregroundStyle(.secondary)
          }
          .listRowBackground(Color.clear)
          .listRowInsets(EdgeInsets(top: Space.s, leading: 0, bottom: Space.s, trailing: 0))
        }
        if !membership.isPro { status }
        Section { sampleMix }
        Section("Included") {
          benefit("Show mix", "How your shows split across musicals, plays, opera and more.", "chart.pie")
          benefit("Earlier years", "Insights for any year you’ve logged, not just this one.", "calendar")
          benefit("All time", "Every show you’ve logged, together.", "infinity")
        }
        if membership.isPro {
          Section { ManageMembershipButton() } header: { Text("You’re a \(membership.name) member") }
        } else {
          Section {
            if offer.isAvailable {
              ForEach(offer.plans) { plan in
                Button {
                  selected = plan.id
                } label: {
                  HStack(spacing: Space.m) {
                    Image(systemName: chosen == plan.id ? "checkmark.circle.fill" : "circle")
                      .font(.title3)
                      .foregroundStyle(chosen == plan.id ? Palette.tint : Color.secondary)
                    VStack(alignment: .leading, spacing: Space.xs) {
                      Text(plan.title).font(.headline)
                      if offer.trialEligible {
                        Text("Free trial").font(.footnote).foregroundStyle(.secondary)
                      }
                    }
                    Spacer(minLength: Space.s)
                    Text(plan.price).font(.headline).monospacedDigit()
                  }
                  .padding(.vertical, Space.xs)
                  .contentShape(.rect)
                }
                .foregroundStyle(.primary)
                .accessibilityAddTraits(chosen == plan.id ? .isSelected : [])
              }
            } else {
              Label("Upgrades aren’t available yet", systemImage: "clock")
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("paywall-unavailable")
            }
          } footer: {
            if let terms = offer.terms { Text(terms) }
          }
          Section {
            Button("Restore purchases") { Task { await flow.restore(source: source) } }
              .disabled(!flow.isAvailable || flow.isBusy)
              .accessibilityIdentifier("paywall-restore")
          }
          legal
        }
      }
      .listStyle(.insetGrouped)
      .navigationTitle(membership.name)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
      }
      .safeAreaInset(edge: .bottom) {
        if !membership.isPro {
          Button {
            if let chosen { Task { await flow.buy(chosen, source: source) } }
          } label: {
            Text(offer.trialEligible ? "Start free trial" : "Upgrade").frame(maxWidth: .infinity)
          }
          .buttonStyle(.borderedProminent)
          .controlSize(.large)
          .disabled(!offer.isAvailable || chosen == nil || flow.isBusy || flow.state == .timedOut)
          .accessibilityIdentifier("paywall-buy")
          .padding(Space.l)
          .frame(maxWidth: .infinity)
          .background(.bar)
        }
      }
      .interactiveDismissDisabled(flow.state == .working)
    }
    .task {
      Analytics.track(.paywallViewed, ["source": .string(source.rawValue), "platform": .string("ios")])
      await paywall.loadOffer()
    }
    .accessibilityIdentifier("paywall")
  }

  /// The purchase's progress. Pro closes the sheet from the router; these are the states in
  /// between and the ways out.
  @ViewBuilder private var status: some View {
    switch flow.state {
    case .idle, .working:
      EmptyView()
    case .confirming:
      Section {
        HStack(spacing: Space.m) {
          ProgressView()
          Text("Confirming…")
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("paywall-confirming")
      }
    case .timedOut:
      Section {
        Text("Your purchase is still confirming. It’ll unlock as soon as it’s through.")
          .accessibilityIdentifier("paywall-timeout")
        Button("Retry") { Task { await flow.retry() } }
          .accessibilityIdentifier("paywall-retry")
      }
    case .pendingApproval:
      Section {
        Text("Your purchase is waiting for approval. \(membership.name) unlocks once it’s approved.")
          .accessibilityIdentifier("paywall-pending")
        Button("Close") { dismiss() }
      }
    case .failed(let message):
      Section { Text(message).foregroundStyle(.red).accessibilityIdentifier("paywall-error") }
    }
  }

  /// What App Review expects beside an auto-renewing subscription: how renewal and cancelling
  /// work, and links to the Terms and the Privacy Policy.
  private var legal: some View {
    Section {
      Link("Terms of Use", destination: AppConfig.current.webURL.appending(path: "terms"))
        .accessibilityIdentifier("paywall-terms")
      Link("Privacy Policy", destination: AppConfig.current.webURL.appending(path: "privacy"))
        .accessibilityIdentifier("paywall-privacy")
    } footer: {
      Text(
        "Payment is charged to your Apple Account when you confirm. \(membership.name) renews automatically unless you cancel at least 24 hours before the end of the current period, and the renewal is charged in the 24 hours before it ends. Manage or cancel any time in Settings › Apple Account › Subscriptions."
      )
    }
  }

  private func benefit(_ title: String, _ text: String, _ symbol: String) -> some View {
    Label {
      VStack(alignment: .leading, spacing: Space.xs) {
        Text(title).font(.headline)
        Text(text).font(.subheadline).foregroundStyle(.secondary)
      }
    } icon: {
      Image(systemName: symbol).foregroundStyle(Palette.tint)
    }
  }
}

/// The one upgrade banner (the Personal Best pattern from #219, restyled in #497): the same card
/// and words wherever a stat is locked, shown once per screen after the free content. A dark card
/// lit by soft glows in the icon's magenta, coral and amber, with a native prominent capsule
/// button. It never draws the real chart and never blocks the screen. With sales off the locked
/// sections show only a plain "Part of {Pro}" note.
struct ProBanner: View {
  let source: PaywallRouter.Source
  var resume: (@MainActor () -> Void)?
  @Environment(Membership.self) private var membership
  @Environment(PaywallRouter.self) private var paywall

  var body: some View {
    if membership.salesEnabled {
      VStack(alignment: .leading, spacing: Space.l) {
        VStack(alignment: .leading, spacing: Space.xs) {
          Text("Unlock all your stats").font(.title2.bold())
          Text("Unlock these stats with \(membership.name).")
            .font(.body).foregroundStyle(.white.opacity(0.85))
        }
        Button {
          paywall.present(source: source, resume: resume)
        } label: {
          Text(paywall.offer.trialEligible ? "Start free trial" : "Upgrade")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.capsule)
        .controlSize(.large)
        .tint(.white)
        .foregroundStyle(.black)
        .accessibilityIdentifier("pro-banner-upgrade")
        if let terms = paywall.offer.terms {
          Text(terms).font(.footnote).foregroundStyle(.white.opacity(0.8))
            .frame(maxWidth: .infinity)
        }
      }
      .foregroundStyle(.white)
      .padding(Space.xl)
      .background { ProBannerGlow() }
      .clipShape(Grouped.shape)
      .listRowInsets(EdgeInsets())
      .listRowBackground(Color.clear)
      .accessibilityElement(children: .contain)
      .accessibilityIdentifier("pro-banner")
      .task { await paywall.loadOffer() }
    } else {
      ProNote()
    }
  }
}

/// Velvet Ink lit by three soft glows from the app icon's sweep. Dark in both appearances, so the
/// white text keeps its contrast (the glows are dimmed to stay above 4.5:1 under it).
private struct ProBannerGlow: View {
  var body: some View {
    ZStack {
      Color(red: 28 / 255, green: 28 / 255, blue: 30 / 255)
      RadialGradient(
        colors: [Color(red: 232 / 255, green: 36 / 255, blue: 127 / 255).opacity(0.55), .clear],
        center: .topLeading, startRadius: 0, endRadius: 260)
      RadialGradient(
        colors: [Color(red: 255 / 255, green: 160 / 255, blue: 64 / 255).opacity(0.42), .clear],
        center: .bottomTrailing, startRadius: 0, endRadius: 240)
      RadialGradient(
        colors: [Color(red: 255 / 255, green: 90 / 255, blue: 90 / 255).opacity(0.3), .clear],
        center: .topTrailing, startRadius: 0, endRadius: 200)
    }
    .accessibilityHidden(true)
  }
}

/// A locked section with sales off: says what it's part of, nothing to tap.
struct ProNote: View {
  @Environment(Membership.self) private var membership
  var body: some View {
    Label("Part of \(membership.name)", systemImage: "lock.fill")
      .font(.subheadline).foregroundStyle(.secondary)
      .accessibilityIdentifier("pro-note")
  }
}

/// Lets a screen that hosts sheets present the paywall. Only the innermost registered host
/// presents, so a Share sheet shows it on top of itself.
private struct PaywallHost: ViewModifier {
  @Environment(PaywallRouter.self) private var paywall
  @State private var id = UUID()

  func body(content: Content) -> some View {
    content
      .onAppear { paywall.register(id) }
      .onDisappear { paywall.unregister(id) }
      .sheet(
        item: Binding(
          get: { paywall.activeHost == id ? paywall.request : nil },
          set: { if $0 == nil { paywall.dismiss() } })
      ) { request in
        PaywallView(source: request.source)
      }
  }
}

extension View {
  func paywallHost() -> some View { modifier(PaywallHost()) }
}

/// Manage the plan where it was bought: the App Store's subscription sheet, or the web
/// membership page; both when the member has both. A web member is never shown a purchase.
struct ManageMembershipButton: View {
  @Environment(Membership.self) private var membership
  @Environment(\.openURL) private var openURL
  @State private var choosing = false

  private var manage: [String] { membership.info?.manage ?? [] }

  var body: some View {
    if !manage.isEmpty {
      Button("Manage \(membership.name)") {
        if manage.count > 1 { choosing = true } else { open(manage[0]) }
      }
      .accessibilityIdentifier("manage-membership")
      .confirmationDialog("Manage \(membership.name)", isPresented: $choosing) {
        if manage.contains("app_store") { Button("Manage in the App Store") { open("app_store") } }
        if manage.contains("web") { Button("Manage on the web") { open("web") } }
      }
    }
  }

  private func open(_ place: String) {
    if place == "app_store" {
      guard let scene = UIApplication.shared.connectedScenes.first(where: { $0 is UIWindowScene }) as? UIWindowScene
      else { return }
      Task { try? await AppStore.showManageSubscriptions(in: scene) }
    } else {
      openURL(AppConfig.current.webURL.appending(path: "app/settings/membership"))
    }
  }
}

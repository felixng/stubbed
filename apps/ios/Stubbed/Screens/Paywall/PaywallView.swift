import SwiftUI

/// The one paywall: what the paid tier adds and the offer the provider returns. Opened only
/// through `PaywallRouter.present`, which also decides where to go back to.
struct PaywallView: View {
  let source: PaywallRouter.Source
  @Environment(Membership.self) private var membership
  @Environment(PaywallRouter.self) private var paywall
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      List {
        Section {
          VStack(alignment: .leading, spacing: Space.s) {
            Text("Get more from your stats").font(.title2.bold())
            Text("\(membership.name) adds the parts of Insights that look back.")
              .font(.subheadline).foregroundStyle(.secondary)
          }
          .padding(.vertical, Space.s)
        }
        Section("Included") {
          benefit("Show mix", "How your shows split across musicals, plays, opera and more.", "chart.pie")
          benefit("Earlier years", "Insights for any year you’ve logged, not just this one.", "calendar")
          benefit("All time", "Every show you’ve logged, together.", "infinity")
        }
        Section {
          if paywall.offer.isAvailable {
            ForEach(paywall.offer.plans) { plan in
              LabeledContent(plan.title, value: plan.price)
            }
          } else {
            Label("Upgrades aren’t available yet", systemImage: "clock")
              .foregroundStyle(.secondary)
              .accessibilityIdentifier("paywall-unavailable")
          }
        } footer: {
          if let terms = paywall.offer.terms { Text(terms) }
        }
        Section {
          Button("Restore purchases") {}
            .disabled(!paywall.offer.isAvailable)
        }
      }
      .listStyle(.insetGrouped)
      .navigationTitle(membership.name)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
      }
      .safeAreaInset(edge: .bottom) {
        Button(paywall.offer.trialEligible ? "Start free trial" : "Upgrade") {}
          .buttonStyle(.borderedProminent)
          .controlSize(.large)
          .disabled(!paywall.offer.isAvailable)
          .padding(Space.l)
          .frame(maxWidth: .infinity)
          .background(.bar)
      }
    }
    .task {
      Analytics.track(.paywallViewed, ["source": .string(source.rawValue), "platform": .string("ios")])
      await paywall.loadOffer()
    }
    .accessibilityIdentifier("paywall")
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

/// The upgrade banner (the Personal Best pattern from #219): free content stays above it, and
/// it sits where the locked section would be. A rounded card with a headline naming the
/// benefit, one line on what the plan adds, one primary button and the provider's terms.
/// With sales off it is only a plain "Part of {Pro}" note, with no button.
struct ProBanner: View {
  let headline: String
  let source: PaywallRouter.Source
  var resume: (@MainActor () -> Void)?
  @Environment(Membership.self) private var membership
  @Environment(PaywallRouter.self) private var paywall

  var body: some View {
    if membership.salesEnabled {
      VStack(alignment: .leading, spacing: Space.m) {
        Label(membership.name, systemImage: "lock.fill")
          .font(.footnote.weight(.semibold)).foregroundStyle(Palette.tintText)
        Text(headline).font(.title3.bold())
        Text("\(membership.name) adds Show mix, earlier years and All time stats.")
          .font(.subheadline).foregroundStyle(.secondary)
        Button(paywall.offer.trialEligible ? "Start free trial" : "Upgrade") {
          paywall.present(source: source, resume: resume)
        }
        .buttonStyle(.borderedProminent)
        .accessibilityIdentifier("pro-banner-upgrade")
        if let terms = paywall.offer.terms {
          Text(terms).font(.caption).foregroundStyle(.secondary)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(Space.l)
      .background(Palette.tintFill, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      .listRowInsets(EdgeInsets(top: Space.s, leading: Space.l, bottom: Space.s, trailing: Space.l))
      .listRowBackground(Color.clear)
      .accessibilityElement(children: .contain)
      .accessibilityIdentifier("pro-banner")
      .task { await paywall.loadOffer() }
    } else {
      ProNote()
    }
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

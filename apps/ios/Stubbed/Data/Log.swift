import os

/// App logging. `scripts/dev logs` shows anything logged under this subsystem.
enum Log {
  static let app = Logger(subsystem: "app.getstubbed", category: "app")
  static let data = Logger(subsystem: "app.getstubbed", category: "data")
}

/// What a screen shows while it fetches: loading, the data, or why it failed.
enum Loadable<Value> {
  case loading
  case loaded(Value)
  case failed(String)

  var value: Value? {
    if case .loaded(let value) = self { value } else { nil }
  }
}

extension Loadable: Sendable where Value: Sendable {}

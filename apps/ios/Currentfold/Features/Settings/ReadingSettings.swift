import Foundation
import Observation

/// The reader's typography preference, and the only place it is stored.
///
/// Device-scoped, like the web's: it lives in `UserDefaults`, not on the account, and Settings
/// says so. Both surfaces that change it — the **Aa** control in the reading toolbar and
/// Settings → Reading — read and write this one object, so they cannot offer different options
/// or disagree about the current one.
///
/// Each field has its own key and its own fallback, so a value written by a future version
/// (or corrupted) costs that one field its default rather than resetting the set. That is the
/// web's `parseTypography` behaviour, kept.
@MainActor
@Observable
final class ReadingSettings {
    private enum Key {
        static let size = "currentfold.reading.textSize"
        static let font = "currentfold.reading.bodyFont"
        static let width = "currentfold.reading.columnWidth"
    }

    var typography: ReadingTypography {
        didSet {
            guard typography != oldValue else { return }
            persist()
        }
    }

    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        typography = ReadingTypography(
            size: Self.read(ReadingTextSize.self, Key.size, from: defaults) ?? .medium,
            font: Self.read(ReadingBodyFont.self, Key.font, from: defaults) ?? .sans,
            width: Self.read(ReadingColumnWidth.self, Key.width, from: defaults) ?? .normal
        )
    }

    /// An instance backed by its own throwaway defaults, so a preview or a test cannot rewrite
    /// the reader's real preference.
    static func ephemeral(_ typography: ReadingTypography = .default) -> ReadingSettings {
        let settings = ReadingSettings(
            defaults: UserDefaults(suiteName: "currentfold.preview.\(UUID().uuidString)")
                ?? .standard
        )
        settings.typography = typography
        return settings
    }

    private func persist() {
        defaults.set(typography.size.rawValue, forKey: Key.size)
        defaults.set(typography.font.rawValue, forKey: Key.font)
        defaults.set(typography.width.rawValue, forKey: Key.width)
    }

    private nonisolated static func read<Value: RawRepresentable>(
        _ type: Value.Type,
        _ key: String,
        from defaults: UserDefaults
    ) -> Value? where Value.RawValue == String {
        guard let raw = defaults.string(forKey: key) else { return nil }
        return Value(rawValue: raw)
    }
}

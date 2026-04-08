import WidgetKit
import SwiftUI
import AppIntents
import Foundation

// MARK: - Constants
// App Group id: AppGroup.generated.swift (npm run generate:ios-app-group / prebuild).
// UserDefaults keys for widget payload: WidgetStorageKeys.generated.swift (npm run generate:widget-keys)
// MARK: - Status Model

struct FriendStatusWidgetItem: Codable, Identifiable {
    let id: String
    let firstName: String
    let lastName: String?
    let optionId: String?
    let optionLabel: String?
    let optionEmoji: String?
    let optionColor: String?
    let note: String?
    let expiresAt: Date?
    let updatedAt: Date

    var displayName: String {
        lastName != nil ? "\(firstName) \(lastName!)" : firstName
    }

    /// Lazy expiration - defaults to "Available" when expired
    var effectiveOptionLabel: String {
        if let expiresAt, expiresAt <= Date() {
            return "Available"
        }
        return optionLabel ?? "Available"
    }
    
    var effectiveOptionEmoji: String {
        if let expiresAt, expiresAt <= Date() {
            return "🟢"
        }
        return optionEmoji ?? "🟢"
    }
    
    var effectiveOptionColor: String {
        if let expiresAt, expiresAt <= Date() {
            return "#10B981" // Green for Available
        }
        return optionColor ?? "#10B981"
    }
    
    /// Check if status has expired
    var isExpired: Bool {
        if let expiresAt, expiresAt <= Date() {
            return true
        }
        return false
    }

    /// Non-empty custom note (widget shows an indicator only — never the note body).
    var hasNonEmptyNote: Bool {
        guard let raw = note?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
            return false
        }
        return true
    }
}

// MARK: - AppEntity (Widget Friend Picker)

struct FriendEntity: AppEntity {
    let id: String
    let name: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Friend"
    static var defaultQuery = FriendQuery()

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }
}

struct FriendQuery: EntityQuery {
    func suggestedEntities() async throws -> [FriendEntity] {
        FriendDataService.shared.fetchAllFriends()
            .map { FriendEntity(id: $0.id, name: $0.displayName) }
    }

    func entities(for identifiers: [String]) async throws -> [FriendEntity] {
        FriendDataService.shared.fetchAllFriends()
            .filter { identifiers.contains($0.id) }
            .map { FriendEntity(id: $0.id, name: $0.displayName) }
    }
}

// MARK: - Widget Background Options (Premium: full list; Free: Default only)

struct WidgetBackgroundOptionsProvider: DynamicOptionsProvider {
    func results() async throws -> [String] {
        let isPremium = FriendDataService.shared.fetchIsPremium()
        if isPremium {
            return ["Default", "Mint-Violet", "Aurora", "Ocean", "Plum Noir", "Mermaidcore", "Golden Hour", "Deep Space", "Soft Clay"]
        }
        return ["Default"]
    }
}

// MARK: - Widget Configuration Intent

@available(iOS 17.0, *)
struct ConfigurationAppIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Select Friends"
    static var description = IntentDescription("Choose which friends to show")

    @Parameter(title: "Friends")
    var selectedFriends: [FriendEntity]?

    @Parameter(title: "Background", optionsProvider: WidgetBackgroundOptionsProvider())
    var backgroundStyle: String?
}

// MARK: - Refresh Widget Intent

@available(iOS 17.0, *)
struct RefreshWidgetIntent: AppIntent {
    static var title: LocalizedStringResource = "Refresh Friend Status"
    static var description = IntentDescription("Refresh the widget to show the latest friend statuses")
    
    func perform() async throws -> some IntentResult {
        await MainActor.run {
            WidgetCenter.shared.reloadTimelines(ofKind: "InstantStatusWidget")
        }
        return .result()
    }
}

// MARK: - ISO8601 (API / JS may include or omit fractional seconds)

private enum WidgetJSONDates {
    private static let internetDateTimeNoFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /// API / RN usually send `toISOString()` (with ms); some paths omit fractional seconds.
    static func parse(_ raw: String) -> Date? {
        let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { return nil }
        if let d = ISO8601DateFormatter.withFractionalSeconds.date(from: s) { return d }
        if let d = internetDateTimeNoFraction.date(from: s) { return d }
        return nil
    }
}

// MARK: - Data Service (App Group)

struct FriendDataService {
    static let shared = FriendDataService()

    /// App syncs premium status; widget gates premium backgrounds.
    func fetchIsPremium() -> Bool {
        guard let defaults = UserDefaults(suiteName: AppGroupConstants.id) else { return false }
        return defaults.string(forKey: WidgetStorageKeys.isPremium) == "true"
    }

    func fetchAllFriends() -> [FriendStatusWidgetItem] {
        guard
            let defaults = UserDefaults(suiteName: AppGroupConstants.id),
            let jsonString = defaults.string(forKey: WidgetStorageKeys.widgetData),
            let jsonData = jsonString.data(using: .utf8)
        else {
            return []
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { dec in
            let container = try dec.singleValueContainer()
            let dateString = try container.decode(String.self)
            guard let date = WidgetJSONDates.parse(dateString) else {
                throw DecodingError.dataCorruptedError(
                    in: container,
                    debugDescription: "Invalid ISO8601 date: \(dateString)"
                )
            }
            return date
        }

        do {
            return try decoder.decode([FriendStatusWidgetItem].self, from: jsonData)
        } catch {
            NSLog("[InstantStatusWidget] fetchAllFriends decode error: %@", String(describing: error))
            return []
        }
    }
}

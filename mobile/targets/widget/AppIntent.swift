import WidgetKit
import SwiftUI
import AppIntents
import Foundation

// MARK: - Constants
private let APP_GROUP_ID = "group.com.arda.instantstatus.dev"
private let WIDGET_DATA_KEY = "widget_status_data"
private let IS_PREMIUM_KEY = "is_premium"
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
            return ["Default", "Mint-Violet", "Contrast", "Liquid Glass", "Plum Noir", "Mermaidcore", "Golden Hour", "Deep Space", "Soft Clay"]
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
    
    // This is what happens when the button is pressed
    func perform() async throws -> some IntentResult {
        // Returning .result() automatically tells iOS to reload the widget's timeline
        // iOS will call the timeline provider to fetch fresh data
        return .result()
    }
}

// MARK: - Data Service (App Group)

struct FriendDataService {
    static let shared = FriendDataService()

    /// App syncs premium status; widget gates premium backgrounds.
    func fetchIsPremium() -> Bool {
        guard let defaults = UserDefaults(suiteName: APP_GROUP_ID) else { return false }
        return defaults.string(forKey: IS_PREMIUM_KEY) == "true"
    }

    func fetchAllFriends() -> [FriendStatusWidgetItem] {
        guard
            let defaults = UserDefaults(suiteName: APP_GROUP_ID),
            let jsonString = defaults.string(forKey: WIDGET_DATA_KEY),
            let jsonData = jsonString.data(using: .utf8)
        else {
            return []
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)

            if let date = ISO8601DateFormatter.withFractionalSeconds.date(from: dateString) {
                return date
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ISO8601 date: \(dateString)"
            )
        }

        do {
            return try decoder.decode([FriendStatusWidgetItem].self, from: jsonData)
        } catch {
            return []
        }
    }
}

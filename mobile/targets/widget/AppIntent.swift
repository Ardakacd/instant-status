import WidgetKit
import SwiftUI
import AppIntents
import Foundation
import OSLog

// MARK: - Constants
private let APP_GROUP_ID = "group.com.arda.instantstatus.dev"
private let WIDGET_DATA_KEY = "widget_status_data"

// MARK: - Status Model

enum StatusState: String, Codable {
    case available, busy, dnd, focus, social, commute
}

struct FriendStatusWidgetItem: Codable, Identifiable {
    let id: String
    let firstName: String
    let lastName: String?
    let state: StatusState
    let note: String?
    let expiresAt: Date?
    let updatedAt: Date

    var displayName: String {
        lastName != nil ? "\(firstName) \(lastName!)" : firstName
    }

    /// Lazy expiration - defaults to available when expired
    var effectiveState: StatusState {
        if let expiresAt, expiresAt <= Date() {
            return .available
        }
        return state
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

// MARK: - Widget Configuration Intent

@available(iOS 17.0, *)
struct ConfigurationAppIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Select Friends"
    static var description = IntentDescription("Choose which friends to show")

    @Parameter(title: "Friends")
    var selectedFriends: [FriendEntity]?
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
    private let logger = Logger(subsystem: "InstantStatus.Widget", category: "Data")

    func fetchAllFriends() -> [FriendStatusWidgetItem] {
        guard
            let defaults = UserDefaults(suiteName: APP_GROUP_ID),
            let jsonString = defaults.string(forKey: WIDGET_DATA_KEY),
            let jsonData = jsonString.data(using: .utf8)
        else {
            logger.warning("No widget data found")
            return []
        }
        logger.info("Widget data: \(jsonString)")
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

        logger.info("Decoding widget data: \(jsonData)")
        do {
            return try decoder.decode([FriendStatusWidgetItem].self, from: jsonData)
        } catch {
            logger.error("Decoding failed: \(String(describing: error))")
            return []
        }
    }
}

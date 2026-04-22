import UserNotifications
import WidgetKit
import Foundation

/// Notification Service Extension — intercepts pushes with `mutable-content: 1`
/// before they are displayed. Writes status data straight to the App Group
/// UserDefaults and triggers a WidgetKit timeline reload, bypassing the RN
/// bridge entirely. This is the only reliable way to update iOS widgets from
/// background pushes — the RN headless JS context is often unavailable or killed.
class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)

        guard let bestAttemptContent = bestAttemptContent else {
            contentHandler(request.content)
            return
        }

        let userInfo = request.content.userInfo

        // Firebase wraps custom data in the top-level userInfo dict.
        let type = userInfo["type"] as? String ?? ""

        // Don't write widget data if the user has logged out — prevents stale pushes
        // from re-populating the widget after clearAll().
        if isLoggedOut() {
            contentHandler(bestAttemptContent)
            return
        }

        if type == "status_update", let userId = userInfo["user_id"] as? String {
            handleStatusUpdate(userInfo: userInfo, userId: userId)
        } else if type == "friend_removed", let peerId = userInfo["peer_user_id"] as? String {
            handleFriendRemoved(peerId: peerId)
        } else if type == "friend_added" || type == "widget_resync_friends" {
            // Can't fetch from API here (no auth token), but reload widget to pick up
            // any data the RN handler managed to write, or force a timeline re-read.
            reloadWidget()
        }

        contentHandler(bestAttemptContent)
    }

    override func serviceExtensionTimeWillExpire() {
        // iOS is about to kill us — deliver whatever we have.
        if let contentHandler = contentHandler, let bestAttemptContent = bestAttemptContent {
            contentHandler(bestAttemptContent)
        }
    }

    // MARK: - Handlers

    private func handleStatusUpdate(userInfo: [AnyHashable: Any], userId: String) {
        guard let defaults = UserDefaults(suiteName: AppGroupConstants.id) else { return }

        let displayName = userInfo["display_name"] as? String ?? ""
        let nameParts = displayName.split(separator: " ", maxSplits: 1)
        let firstName = nameParts.first.map(String.init) ?? displayName
        let lastName: String? = nameParts.count > 1 ? String(nameParts[1]) : nil

        let optionId = (userInfo["option_id"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        let optionLabel = (userInfo["option_label"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        let optionEmoji = (userInfo["option_emoji"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        let optionColor = (userInfo["option_color"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        let note = (userInfo["note"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        let expiresAt = (userInfo["expires_at"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        let timestamp = userInfo["timestamp"] as? String ?? ISO8601DateFormatter().string(from: Date())

        // Read existing widget data
        var friends = readWidgetData(from: defaults)

        // Build the updated item — use NSNull for nil values to match the RN JSON format
        // (RN writes `"lastName": null` explicitly; omitting the key would cause inconsistency).
        let updatedItem: [String: Any] = [
            "id": userId,
            "firstName": firstName,
            "lastName": lastName as Any? ?? NSNull(),
            "optionId": optionId as Any? ?? NSNull(),
            "optionLabel": optionLabel as Any? ?? NSNull(),
            "optionEmoji": optionEmoji as Any? ?? NSNull(),
            "optionColor": optionColor as Any? ?? NSNull(),
            "note": note as Any? ?? NSNull(),
            "expiresAt": expiresAt as Any? ?? NSNull(),
            "updatedAt": timestamp,
        ]

        // Merge into list (replace existing or append)
        if let idx = friends.firstIndex(where: { ($0["id"] as? String) == userId }) {
            friends[idx] = updatedItem
        } else {
            friends.append(updatedItem)
        }

        // Write back
        writeWidgetData(friends, to: defaults)
        reloadWidget()
    }

    private func handleFriendRemoved(peerId: String) {
        guard let defaults = UserDefaults(suiteName: AppGroupConstants.id) else { return }

        var friends = readWidgetData(from: defaults)
        let before = friends.count
        friends.removeAll { ($0["id"] as? String) == peerId }
        guard friends.count != before else { return }

        writeWidgetData(friends, to: defaults)
        reloadWidget()
    }

    // MARK: - App Group read/write

    /// Read the JSON array of friend status items from App Group UserDefaults.
    /// The RN side stores this as a JSON string via `setString`.
    private func readWidgetData(from defaults: UserDefaults) -> [[String: Any]] {
        // RN ExtensionStorage.setString stores a plain string (not NSData).
        // Try string first, then fall back to data.
        if let jsonString = defaults.string(forKey: WidgetStorageKeys.widgetData),
           let data = jsonString.data(using: .utf8),
           let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            return arr
        }
        if let data = defaults.data(forKey: WidgetStorageKeys.widgetData),
           let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            return arr
        }
        return []
    }

    /// Write the JSON array back as a plain string (matching the RN `setString` format)
    /// so the widget's `FriendDataService.fetchAllFriends()` can read it with `defaults.string(forKey:)`.
    private func writeWidgetData(_ friends: [[String: Any]], to defaults: UserDefaults) {
        guard let data = try? JSONSerialization.data(withJSONObject: friends, options: []),
              let jsonString = String(data: data, encoding: .utf8) else { return }
        defaults.set(jsonString, forKey: WidgetStorageKeys.widgetData)
        // Force cross-process sync so the widget extension sees the write immediately.
        defaults.synchronize()
    }

    private func isLoggedOut() -> Bool {
        guard let defaults = UserDefaults(suiteName: AppGroupConstants.id) else { return true }
        return defaults.string(forKey: WidgetStorageKeys.loggedOut) == "true"
    }

    private func reloadWidget() {
        WidgetCenter.shared.reloadTimelines(ofKind: "InstantStatusWidget")
    }
}

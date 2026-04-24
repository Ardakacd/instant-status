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

        // FCM `data` fields are usually top-level strings; coerce defensively (NSNumber, etc.).
        let type = Self.stringValue(userInfo["type"]) ?? ""

        // Don't write widget data if the user has logged out — prevents stale pushes
        // from re-populating the widget after clearAll().
        if isLoggedOut() {
            contentHandler(bestAttemptContent)
            return
        }

        if type == "status_update", let userId = Self.stringValue(userInfo["user_id"]) {
            handleStatusUpdate(userInfo: userInfo, userId: userId)
        } else if type == "friend_removed", let peerId = Self.stringValue(userInfo["peer_user_id"]) {
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

        let displayName = Self.stringValue(userInfo["display_name"]) ?? ""
        let nameParts = displayName.split(separator: " ", maxSplits: 1)
        let firstName = nameParts.first.map(String.init) ?? displayName
        let lastName: String? = nameParts.count > 1 ? String(nameParts[1]) : nil

        let optionId = Self.stringValue(userInfo["option_id"])
        let optionLabel = Self.stringValue(userInfo["option_label"])
        let optionEmoji = Self.stringValue(userInfo["option_emoji"])
        let optionColor = Self.stringValue(userInfo["option_color"])
        let note = Self.stringValue(userInfo["note"])
        let expiresAt = Self.stringValue(userInfo["expires_at"])
        let timestamp = Self.stringValue(userInfo["timestamp"]) ?? ISO8601DateFormatter().string(from: Date())

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

    /// Normalize FCM / APNs userInfo values to String (handles NSNumber and empty strings).
    private static func stringValue(_ any: Any?) -> String? {
        if let s = any as? String {
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? nil : t
        }
        if let n = any as? NSNumber {
            return n.stringValue
        }
        return nil
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
        // Flush any cross-process writes (e.g. last snapshot from the app before force-quit).
        defaults.synchronize()
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
        // Match readWidgetData: flush App Group visibility across processes before gating.
        defaults.synchronize()
        return defaults.string(forKey: WidgetStorageKeys.loggedOut) == "true"
    }

    private func reloadWidget() {
        // Small delay lets UserDefaults cross-process sync settle before the widget
        // extension reads the data. Without this, the widget can read stale values.
        Thread.sleep(forTimeInterval: 0.05)
        // Prefer kind-specific reload: reloadAllTimelines() asks WidgetKit to refresh
        // every widget kind in the app — unnecessary budget cost when we only ship one.
        // Run on the main queue (WidgetKit expectation; matches ExtensionStorage in the app).
        let reload = {
            WidgetCenter.shared.reloadTimelines(ofKind: "InstantStatusWidget")
        }
        if Thread.isMainThread {
            reload()
        } else {
            DispatchQueue.main.sync(execute: reload)
        }
        // reloadTimelines is fire-and-forget XPC — keep the NSE alive briefly so the
        // request is not torn down with the process (see didReceive → contentHandler).
        Thread.sleep(forTimeInterval: 0.5)
    }
}

import { Platform } from "react-native";
import { ExtensionStorage } from "@bacons/apple-targets";
import { Status } from "../types";

const APP_GROUP_ID = "group.com.arda.instantstatus.dev";
const WIDGET_DATA_KEY = "widget_status_data";

interface FriendStatusWidgetItem {
  id: string;
  firstName: string;
  lastName: string | null;
  state: string; // lowercase state for Swift enum
  note: string | null;
  expiresAt: string | null;
  updatedAt: string;
}

export class WidgetStorageService {
  private storage: ExtensionStorage | null = null;
  private lastReloadTime: number = 0;
  private readonly RELOAD_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    if (Platform.OS === "ios") {
      this.storage = new ExtensionStorage(APP_GROUP_ID);
    }
  }

  /**
   * Update a single friend's status in widget storage
   * Only reloads widget if the status actually changed (not duplicate)
   */
  async updateFriendStatus(
    userId: string,
    displayName: string,
    state: string,
    note: string | null,
    expiresAt: string | null,
    timestamp: string
  ): Promise<void> {
    if (Platform.OS !== "ios" || !this.storage) {
      return;
    }

    try {
      // Get existing widget data
      const existingData = this.storage.get(WIDGET_DATA_KEY);
      let friendsData: FriendStatusWidgetItem[] = [];

      if (existingData) {
        try {
          const dataString =
            typeof existingData === "string"
              ? existingData
              : JSON.stringify(existingData);
          friendsData = JSON.parse(dataString);
        } catch (e) {
          console.warn("Failed to parse existing widget data:", e);
          friendsData = [];
        }
      }

      // Prepare new status item
      const displayNameStr =
        typeof displayName === "string"
          ? displayName
          : String(displayName || "");
      const stateStr =
        typeof state === "string" ? state : String(state || "offline");

      const friendStatusItem: FriendStatusWidgetItem = {
        id: userId,
        firstName: displayNameStr.split(" ")[0] || displayNameStr,
        lastName: displayNameStr.split(" ").slice(1).join(" ") || null,
        state: stateStr.toLowerCase(), // Convert to lowercase for Swift enum
        note: note || null,
        expiresAt: expiresAt || null,
        updatedAt: timestamp,
      };

      // Check if friend exists and if status actually changed (avoid duplicate reloads)
      const friendIndex = friendsData.findIndex((f) => f.id === userId);
      let statusChanged = true;

      if (friendIndex >= 0) {
        // Friend exists, check if status changed
        const existingFriend = friendsData[friendIndex];
        statusChanged =
          existingFriend.state !== friendStatusItem.state ||
          existingFriend.note !== friendStatusItem.note ||
          existingFriend.expiresAt !== friendStatusItem.expiresAt;

        if (!statusChanged) {
          // Status unchanged, no need to reload
          console.log(
            `Friend ${userId} status unchanged, skipping widget reload`
          );
          return;
        }

        // Update existing friend's status
        friendsData[friendIndex] = friendStatusItem;
      } else {
        // Friend doesn't exist, add them
        friendsData.push(friendStatusItem);
      }
      console.log("friendsData", friendsData);
      // Save updated data
      this.storage.set(WIDGET_DATA_KEY, friendsData as any);

      // Only reload widget if status changed and cooldown has passed
      const now = Date.now();
      const timeSinceLastReload = now - this.lastReloadTime;

      if (timeSinceLastReload >= this.RELOAD_COOLDOWN_MS) {
        ExtensionStorage.reloadWidget();
        this.lastReloadTime = now;
        console.log(
          `Friend ${userId} status updated in widget storage, widget reloaded`
        );
      } else {
        console.log(
          `Friend ${userId} status updated in widget storage, reload skipped (cooldown: ${Math.ceil(
            (this.RELOAD_COOLDOWN_MS - timeSinceLastReload) / 1000
          )}s remaining)`
        );
      }
    } catch (error) {
      console.error("Error updating widget storage:", error);
    }
  }

  /**
   * Save all friend statuses to widget storage
   * Used when fetching the full list of friends
   */
  async saveAllFriendStatuses(statuses: Status[]): Promise<void> {
    if (Platform.OS !== "ios" || !this.storage) {
      return;
    }

    try {
      // Convert Status[] to widget format
      const widgetData: FriendStatusWidgetItem[] = statuses.map((status) => ({
        id: status.user_id,
        firstName: status.first_name || "Unknown",
        lastName: status.last_name || null,
        state: status.state.toLowerCase(), // Convert to lowercase for Swift enum
        note: status.note || null,
        expiresAt: status.expires_at || null,
        updatedAt: status.updated_at,
      }));
      console.log("widgetData", widgetData);

      this.storage.set(WIDGET_DATA_KEY, widgetData as any);

      // Check cooldown before reloading
      const now = Date.now();
      const timeSinceLastReload = now - this.lastReloadTime;

      if (timeSinceLastReload >= this.RELOAD_COOLDOWN_MS) {
        ExtensionStorage.reloadWidget();
        this.lastReloadTime = now;
        console.log(
          "All friend statuses saved to widget storage, widget reloaded"
        );
      } else {
        console.log(
          `All friend statuses saved to widget storage, reload skipped (cooldown: ${Math.ceil(
            (this.RELOAD_COOLDOWN_MS - timeSinceLastReload) / 1000
          )}s remaining)`
        );
      }
    } catch (error) {
      console.error("Error saving friend statuses to widget storage:", error);
    }
  }
}

export const widgetStorageService = new WidgetStorageService();

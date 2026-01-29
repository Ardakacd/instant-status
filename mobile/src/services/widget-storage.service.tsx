import { Platform } from "react-native";
import { ExtensionStorage } from "@bacons/apple-targets";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Status } from "../types";
// Import your Android Widget Component and the request function
import { requestWidgetUpdate } from "react-native-android-widget";
import { InstantStatusWidget } from "../../android-widget/InstantStatusWidget";

const APP_GROUP_ID = "group.com.arda.instantstatus.dev";
const WIDGET_DATA_KEY = "widget_status_data";

interface FriendStatusWidgetItem {
  id: string;
  firstName: string;
  lastName: string | null;
  optionId: string | null;
  optionLabel: string | null;
  optionEmoji: string | null;
  optionColor: string | null;
  note: string | null;
  expiresAt: string | null;
  updatedAt: string;
}

export class WidgetStorageService {
  private storage: ExtensionStorage | null = null;
  private lastReloadTime: number = 0;
  private readonly RELOAD_COOLDOWN_MS = 5 * 60 * 1000; 

  constructor() {
    if (Platform.OS === "ios") {
      this.storage = new ExtensionStorage(APP_GROUP_ID);
    }
  }

  /**
   * Helper to trigger Android Widget Update
   */
  private async triggerAndroidUpdate() {
    try {
      await requestWidgetUpdate({
        widgetName: "InstantStatusWidget",
        renderWidget: () => <InstantStatusWidget />,
      });
      this.lastReloadTime = Date.now();
    } catch (error) {
      console.error("Android widget update failed:", error);
    }
  }

  async updateFriendStatus(
    userId: string,
    displayName: string,
    optionId: string | null,
    optionLabel: string | null,
    optionEmoji: string | null,
    optionColor: string | null,
    note: string | null,
    expiresAt: string | null,
    timestamp: string
  ): Promise<void> {
    try {
      let friendsData: FriendStatusWidgetItem[] = [];

      console.log("Platform.OS", Platform.OS);
      console.log("this.storage", this.storage);

      // 1. Fetch Data
      if (Platform.OS === "ios" && this.storage) {
        const existingData = this.storage.get(WIDGET_DATA_KEY);
        if (existingData) {
          try {
            const dataString = typeof existingData === "string" ? existingData : JSON.stringify(existingData);
            friendsData = JSON.parse(dataString);
          } catch (e) {
            friendsData = [];
          }
        }
      } else if (Platform.OS === "android") {
        const existingData = await AsyncStorage.getItem(WIDGET_DATA_KEY);
        if (existingData) {
          try {
            friendsData = JSON.parse(existingData);
          } catch (e) {
            friendsData = [];
          }
        }
      } else {
        return;
      }

      console.log("friendsData", friendsData);

      // 2. Prepare Item
      const displayNameStr = String(displayName || "");
      const friendStatusItem: FriendStatusWidgetItem = {
        id: userId,
        firstName: displayNameStr.split(" ")[0] || displayNameStr,
        lastName: displayNameStr.split(" ").slice(1).join(" ") || null,
        optionId: optionId || null,
        optionLabel: optionLabel || null,
        optionEmoji: optionEmoji || null,
        optionColor: optionColor || null,
        note: note || null,
        expiresAt: expiresAt || null,
        updatedAt: timestamp,
      };

      // 3. Diff check
      const friendIndex = friendsData.findIndex((f) => f.id === userId);
      if (friendIndex >= 0) {
        const existing = friendsData[friendIndex];
        const hasChanged = existing.optionId !== friendStatusItem.optionId || 
                           existing.note !== friendStatusItem.note || 
                           existing.expiresAt !== friendStatusItem.expiresAt;
        console.log("hasChanged", hasChanged);
        if (!hasChanged) return;
        friendsData[friendIndex] = friendStatusItem;
      } else {
        friendsData.push(friendStatusItem);
      }

      const jsonString = JSON.stringify(friendsData);
      console.log(Platform.OS, "jsonString", this.storage);

      // 4. Save and Reload
      if (Platform.OS === "ios" && this.storage) {
        console.log("update friend statusjsonString", jsonString);
        this.storage.set(WIDGET_DATA_KEY, jsonString);
        ExtensionStorage.reloadWidget("InstantStatusWidget");
        this.lastReloadTime = Date.now();
      } else if (Platform.OS === "android") {
        await AsyncStorage.setItem(WIDGET_DATA_KEY, jsonString);
        await this.triggerAndroidUpdate();
      }
    } catch (error) {
      console.error("Error updating widget storage:", error);
    }
  }

  async saveAllFriendStatuses(statuses: Status[]): Promise<void> {
    try {
      console.log("statuses", statuses);
      const widgetData: FriendStatusWidgetItem[] = statuses.map((status) => ({
        id: status.user_id,
        firstName: status.first_name || "Unknown",
        lastName: status.last_name || null,
        optionId: status.option?.id || null,
        optionLabel: status.option?.label || null,
        optionEmoji: status.option?.emoji || null,
        optionColor: status.option?.color || null,
        note: status.note || null,
        expiresAt: status.expires_at || null,
        updatedAt: status.updated_at,
      }));

      const jsonString = JSON.stringify(widgetData);

      console.log("jsonString", jsonString);

      if (Platform.OS === "ios" && this.storage) {
        this.storage.set(WIDGET_DATA_KEY, jsonString);
        
        const now = Date.now();
        if (now - this.lastReloadTime >= this.RELOAD_COOLDOWN_MS) {
          ExtensionStorage.reloadWidget("InstantStatusWidget");
          this.lastReloadTime = now;
        }
      } else if (Platform.OS === "android") {
        await AsyncStorage.setItem(WIDGET_DATA_KEY, jsonString);
        await this.triggerAndroidUpdate();
      }
    } catch (error) {
      console.error("Error saving all friend statuses:", error);
    }
  }

  /**
   * Clear all widget data (used during logout to prevent data leakage)
   */
  async clearAll(): Promise<void> {
    try {
      if (Platform.OS === "ios" && this.storage) {
        this.storage.remove(WIDGET_DATA_KEY);
        ExtensionStorage.reloadWidget("InstantStatusWidget");
      } else if (Platform.OS === "android") {
        await AsyncStorage.removeItem(WIDGET_DATA_KEY);
        await this.triggerAndroidUpdate();
      }
    } catch (error) {
      console.error("Error clearing widget storage:", error);
    }
  }
}

export const widgetStorageService = new WidgetStorageService();


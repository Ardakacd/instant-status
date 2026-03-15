import { Platform } from "react-native";
import { ExtensionStorage } from "@bacons/apple-targets";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Status } from "../types";
import { requestWidgetUpdate } from "react-native-android-widget";
import Sentry from "../../sentry";

const APP_GROUP_ID = "group.com.arda.instantstatus.dev";
const WIDGET_DATA_KEY = "widget_status_data";
const IS_PREMIUM_KEY = "is_premium";

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
  private readonly RELOAD_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes (bulk sync)
  private reloadTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBOUNCE_MS = 1500; // Debounce per-friend updates

  constructor() {
    if (Platform.OS === "ios") {
      this.storage = new ExtensionStorage(APP_GROUP_ID);
    }
  }

  /**
   * Debounce widget reload — batches rapid per-friend updates into a single reload.
   * Data is saved immediately; only the reload is delayed until updates settle.
   */
  private scheduleReload() {
    if (this.reloadTimeout) {
      clearTimeout(this.reloadTimeout);
    }
    this.reloadTimeout = setTimeout(() => {
      if (Platform.OS === "ios") {
        ExtensionStorage.reloadWidget("InstantStatusWidget");
      }
      this.reloadTimeout = null;
      this.lastReloadTime = Date.now();
    }, this.DEBOUNCE_MS);
  }

  /**
   * Helper to trigger Android Widget Update
   * This tells Android to wake up the widgetTaskHandler, which will:
   * 1. Load the data from AsyncStorage
   * 2. Filter by widget-specific configuration (widget_config_{id})
   * 3. Render the widget with the correct filtered data for each widget instance
   * 
   * Note: We don't provide a renderWidget here. This forces the widgetTaskHandler
   * to be the single source of truth, ensuring each widget instance respects its
   * own configuration without any race conditions or flickering.
   */
  private async triggerAndroidUpdate() {
    try {
      // We only tell Android: "The data for this widget class has changed."
      // We don't provide a render function here.
      // This forces the 'widgetTaskHandler.ts' to run for EVERY instance of the widget on the home screen.
      // Type assertion is needed because TypeScript types require renderWidget, but the runtime API
      // supports calling without it, which triggers the handler to be the single source of truth.
      await requestWidgetUpdate({
        widgetName: "InstantStatusWidget",
      } as any);
      this.lastReloadTime = Date.now();
    } catch (error) {
      Sentry.Native.captureException(error);
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
                           existing.optionLabel !== friendStatusItem.optionLabel ||
                           existing.optionEmoji !== friendStatusItem.optionEmoji ||
                           existing.optionColor !== friendStatusItem.optionColor ||
                           existing.note !== friendStatusItem.note ||
                           existing.expiresAt !== friendStatusItem.expiresAt ||
                           existing.firstName !== friendStatusItem.firstName ||
                           existing.lastName !== friendStatusItem.lastName;
        if (!hasChanged) return;
        friendsData[friendIndex] = friendStatusItem;
      } else {
        friendsData.push(friendStatusItem);
      }

      const jsonString = JSON.stringify(friendsData);

      // 4. Save and Reload (debounced on iOS to batch rapid push updates)
      if (Platform.OS === "ios" && this.storage) {
        this.storage.set(WIDGET_DATA_KEY, jsonString);
        this.scheduleReload();
      } else if (Platform.OS === "android") {
        await AsyncStorage.setItem(WIDGET_DATA_KEY, jsonString);
        await this.triggerAndroidUpdate();
      }
    } catch (error) {
      Sentry.Native.captureException(error);
    }
  }

  async saveAllFriendStatuses(statuses: Status[]): Promise<void> {
    try {
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
      Sentry.Native.captureException(error);
    }
  }

  /**
   * Force widget to reload (e.g. when app comes to foreground to pick up changes).
   */
  async reloadWidget(): Promise<void> {
    if (Platform.OS === "ios") {
      ExtensionStorage.reloadWidget("InstantStatusWidget");
    } else if (Platform.OS === "android") {
      await this.triggerAndroidUpdate();
    }
  }

  /**
   * Sync premium status to App Group (iOS) / AsyncStorage (Android) so the widget can gate premium backgrounds.
   */
  async setPremiumStatus(isPremium: boolean): Promise<void> {
    try {
      if (Platform.OS === "ios" && this.storage) {
        this.storage.set(IS_PREMIUM_KEY, isPremium ? "true" : "false");
        ExtensionStorage.reloadWidget("InstantStatusWidget");
      } else if (Platform.OS === "android") {
        await AsyncStorage.setItem(IS_PREMIUM_KEY, isPremium ? "true" : "false");
        await this.triggerAndroidUpdate();
      }
    } catch (error) {
      Sentry.Native.captureException(error);
    }
  }

  /**
   * Clear all widget data (used during logout to prevent data leakage)
   */
  async clearAll(): Promise<void> {
    try {
      if (this.reloadTimeout) {
        clearTimeout(this.reloadTimeout);
        this.reloadTimeout = null;
      }
      if (Platform.OS === "ios" && this.storage) {
        this.storage.remove(WIDGET_DATA_KEY);
        this.storage.remove(IS_PREMIUM_KEY);
        ExtensionStorage.reloadWidget("InstantStatusWidget");
      } else if (Platform.OS === "android") {
        await AsyncStorage.removeItem(WIDGET_DATA_KEY);
        await AsyncStorage.removeItem(IS_PREMIUM_KEY);
        await this.triggerAndroidUpdate();
      }
    } catch (error) {
      Sentry.Native.captureException(error);
    }
  }
}

export const widgetStorageService = new WidgetStorageService();


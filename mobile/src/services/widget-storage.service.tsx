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
    } catch (error) {
      Sentry.captureException(error);
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
      Sentry.captureException(error);
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
        ExtensionStorage.reloadWidget("InstantStatusWidget");
      } else if (Platform.OS === "android") {
        await AsyncStorage.setItem(WIDGET_DATA_KEY, jsonString);
        await this.triggerAndroidUpdate();
      }
    } catch (error) {
      Sentry.captureException(error);
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
      Sentry.captureException(error);
    }
  }

  /**
   * DEV ONLY: Seed mock friends for widget layout testing (e.g. 24 friends for premium large widget).
   * Call from ProfileScreen dev section. Also sets premium status so large widget shows up to 24 friends.
   */
  async seedMockFriendsForWidgetTesting(count: number): Promise<void> {
    const MOCK_OPTIONS: Array<{
      optionId: string;
      optionLabel: string;
      optionEmoji: string;
      optionColor: string;
    }> = [
      { optionId: "available", optionLabel: "Available", optionEmoji: "🟢", optionColor: "#10B981" },
      { optionId: "busy", optionLabel: "Busy", optionEmoji: "🟠", optionColor: "#F59E0B" },
      { optionId: "focus", optionLabel: "Focus", optionEmoji: "🟣", optionColor: "#8B5CF6" },
      { optionId: "dnd", optionLabel: "Do Not Disturb", optionEmoji: "🔴", optionColor: "#EF4444" },
      { optionId: "social", optionLabel: "Social", optionEmoji: "🩷", optionColor: "#EC4899" },
      { optionId: "commute", optionLabel: "Commute", optionEmoji: "🔵", optionColor: "#3B82F6" },
    ];
    const MOCK_EMOJIS = [
      "🟢", "🟡", "🟠", "🔴", "🟣", "🩵", "💙", "💜", "🩷", "❤️", "💚", "💛",
      "🧡", "☕️", "🚀", "💼", "🏃", "🏠", "📞", "📧", "🎯", "🛑", "💤", "🌟",
    ];
    const MOCK_FIRST_NAMES = [
      "Alexandra", "Emmanuel", "Christopher", "Alexandria", "Benjamin", "Katherine", "Theodore", "Melissa",
      "Evangeline", "Sebastian", "Olivia", "Alexander", "Anastasia", "Nathaniel", "Sophia", "Maximilian",
      "Isabella", "Lucas", "Michelle", "Ethan", "Charlotte", "Oliver", "Amelia", "Elizabeth",
    ];
    const MOCK_NOTES = [
      "Working from home today, available for calls in the afternoon",
      "In a meeting until 3pm, please send an email for urgent matters",
      "Focus mode: deep work on project deadline, back in 2 hours",
      "At the gym, will check messages when done around 5pm",
      "Lunch break with the team, back at desk by 2pm",
      "Driving to the office, can't respond for about 45 minutes",
    ];
    /** Realistic surnames (not "Friend10") so widget config picker stays readable while testing long display names. */
    const MOCK_LAST_NAMES = [
      "Nicholson",
      "Okonkwo",
      "Sullivan",
      "Vijayakumar",
      "Montgomery",
    ];
    const now = new Date().toISOString();
    const items: FriendStatusWidgetItem[] = Array.from({ length: count }, (_, i) => {
      const opt = MOCK_OPTIONS[i % MOCK_OPTIONS.length];
      const firstName = MOCK_FIRST_NAMES[i % MOCK_FIRST_NAMES.length];
      const note = MOCK_NOTES[i % MOCK_NOTES.length];
      // Every mock friend gets a future expiry (staggered: same-day + multi-day for widget "until …").
      const expiresAt = new Date(
        Date.now() +
          (2 + (i % 10)) * 3600 * 1000 + // +2–11 h
          (i % 3) * 24 * 3600 * 1000 + // +0 / +1 / +2 calendar days
          i * 30 * 60 * 1000 // +30 min per index
      ).toISOString();
      const emoji = MOCK_EMOJIS[i % MOCK_EMOJIS.length];
      return {
        id: `mock-${i + 1}`,
        firstName,
        lastName: i % 5 === 0 ? MOCK_LAST_NAMES[(i / 5) % MOCK_LAST_NAMES.length] : null,
        optionId: opt.optionId,
        optionLabel: opt.optionLabel,
        optionEmoji: emoji,
        optionColor: opt.optionColor,
        note,
        expiresAt,
        updatedAt: now,
      };
    });
    const jsonString = JSON.stringify(items);
    try {
      if (Platform.OS === "ios" && this.storage) {
        this.storage.set(WIDGET_DATA_KEY, jsonString);
        this.storage.set(IS_PREMIUM_KEY, "true");
        ExtensionStorage.reloadWidget("InstantStatusWidget");
      } else if (Platform.OS === "android") {
        await AsyncStorage.setItem(WIDGET_DATA_KEY, jsonString);
        await AsyncStorage.setItem(IS_PREMIUM_KEY, "true");
        await this.triggerAndroidUpdate();
      }
    } catch (error) {
      Sentry.captureException(error);
      throw error;
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
      Sentry.captureException(error);
    }
  }
}

export const widgetStorageService = new WidgetStorageService();


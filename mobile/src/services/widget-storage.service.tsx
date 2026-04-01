import { AppState, Platform } from "react-native";
import { ExtensionStorage } from "@bacons/apple-targets";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Status } from "../types";
import { requestWidgetUpdate } from "react-native-android-widget";
import Sentry from "../../sentry";
import {
  IS_PREMIUM_KEY,
  WIDGET_DATA_KEY,
  WIDGET_PENDING_TIMELINE_RELOAD_KEY,
} from "../../android-widget/widget-shared";

/** Must match App Group in Apple Developer, app entitlements, and AppGroup.generated.swift (prebuild). */
const APP_GROUP_ID =
  process.env.EXPO_PUBLIC_IOS_APP_GROUP ?? "group.com.arda.instantstatus.dev";

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

  /** Lets AppDelegate reload only when debounce did not run before suspend (saves WidgetKit budget). */
  private markIosTimelineReloadPending() {
    if (Platform.OS === "ios" && this.storage) {
      this.storage.set(WIDGET_PENDING_TIMELINE_RELOAD_KEY, "1");
    }
  }

  private clearIosTimelineReloadPending() {
    if (Platform.OS === "ios" && this.storage) {
      this.storage.remove(WIDGET_PENDING_TIMELINE_RELOAD_KEY);
    }
  }

  /**
   * Debounce widget reload — batches rapid per-friend updates into a single reload.
   * Data is saved immediately; only the reload is delayed until updates settle.
   */
  private scheduleReload() {
    if (this.reloadTimeout) {
      clearTimeout(this.reloadTimeout);
      this.reloadTimeout = null;
    }

    const runReload = () => {
      if (Platform.OS === "ios") {
        ExtensionStorage.reloadWidget("InstantStatusWidget");
        this.clearIosTimelineReloadPending();
      }
      this.reloadTimeout = null;
    };

    // Background / inactive: timers often never fire before suspension; App Group is
    // already updated — reload immediately. Foreground: debounce rapid updates.
    if (Platform.OS === "ios" && AppState.currentState !== "active") {
      runReload();
      return;
    }

    this.reloadTimeout = setTimeout(runReload, this.DEBOUNCE_MS);
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
      // Omit renderWidget intentionally — the runtime supports it even though the type does not.
      // Omitting it causes Android to invoke widgetTaskHandler for every on-screen instance,
      // which is the single source of truth for per-widget config (selected friends, background).
      type TriggerOnly = { widgetName: string; widgetNotFound?: () => void };
      await (requestWidgetUpdate as unknown as (p: TriggerOnly) => Promise<void>)({
        widgetName: "InstantStatusWidget",
      });
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
        this.markIosTimelineReloadPending();
        this.scheduleReload();
      } else if (Platform.OS === "android") {
        await AsyncStorage.setItem(WIDGET_DATA_KEY, jsonString);
        await this.triggerAndroidUpdate();
      }
    } catch (error) {
      Sentry.captureException(error);
    }
  }

  /**
   * Remove one friend from the widget snapshot (e.g. after unfriend push). No-op if not present.
   */
  async removeFriendFromWidget(peerUserId: string): Promise<void> {
    try {
      const id = String(peerUserId || "").trim();
      if (!id) return;

      let friendsData: FriendStatusWidgetItem[] = [];

      if (Platform.OS === "ios" && this.storage) {
        const existingData = this.storage.get(WIDGET_DATA_KEY);
        if (existingData) {
          try {
            const dataString =
              typeof existingData === "string"
                ? existingData
                : JSON.stringify(existingData);
            friendsData = JSON.parse(dataString);
          } catch {
            friendsData = [];
          }
        }
      } else if (Platform.OS === "android") {
        const existingData = await AsyncStorage.getItem(WIDGET_DATA_KEY);
        if (existingData) {
          try {
            friendsData = JSON.parse(existingData);
          } catch {
            friendsData = [];
          }
        }
      } else {
        return;
      }

      const next = friendsData.filter((f) => f.id !== id);
      if (next.length === friendsData.length) return;

      const jsonString = JSON.stringify(next);

      if (Platform.OS === "ios" && this.storage) {
        this.storage.set(WIDGET_DATA_KEY, jsonString);
        this.markIosTimelineReloadPending();
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
        this.markIosTimelineReloadPending();
        this.scheduleReload();
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
      this.clearIosTimelineReloadPending();
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
        this.markIosTimelineReloadPending();
        this.scheduleReload();
      } else if (Platform.OS === "android") {
        await AsyncStorage.setItem(IS_PREMIUM_KEY, isPremium ? "true" : "false");
        await this.triggerAndroidUpdate();
      }
    } catch (error) {
      Sentry.captureException(error);
    }
  }

  /**
   * DEV ONLY: Seed mock friends for widget layout testing (e.g. 8 for marketing screenshots, 24 for stress test).
   * First 8 rows use curated names + distinct emojis (label matches emoji for screenshots).
   * Call from ProfileScreen dev section. Also sets premium status.
   */
  async seedMockFriendsForWidgetTesting(count: number): Promise<void> {
    /** Eight marketing/demo rows: different emoji per row, short readable names. */
    const WIDGET_DEMO_PRESETS: Array<{
      optionId: string;
      optionLabel: string;
      optionEmoji: string;
      optionColor: string;
      firstName: string;
      note: string | null;
    }> = [
      {
        optionId: "available",
        optionLabel: "Available",
        optionEmoji: "✅",
        optionColor: "#10B981",
        firstName: "Mia",
        note: "Free to chat",
      },
      {
        optionId: "busy",
        optionLabel: "In meetings",
        optionEmoji: "📅",
        optionColor: "#F59E0B",
        firstName: "Leo",
        note: "Until 4pm",
      },
      {
        optionId: "focus",
        optionLabel: "Deep focus",
        optionEmoji: "🎯",
        optionColor: "#8B5CF6",
        firstName: "Zoe",
        note: null,
      },
      {
        optionId: "ooo",
        optionLabel: "Out of office",
        optionEmoji: "🏝️",
        optionColor: "#0891B2",
        firstName: "Sam",
        note: "Back Monday",
      },
      {
        optionId: "commute",
        optionLabel: "On the way",
        optionEmoji: "🚗",
        optionColor: "#2563EB",
        firstName: "Ava",
        note: "ETA ~20 min",
      },
      {
        optionId: "dnd",
        optionLabel: "Do not disturb",
        optionEmoji: "🔕",
        optionColor: "#EF4444",
        firstName: "Max",
        note: "Recording",
      },
      {
        optionId: "social",
        optionLabel: "Social",
        optionEmoji: "🎉",
        optionColor: "#EC4899",
        firstName: "Jade",
        note: "Dinner w/ team",
      },
      {
        optionId: "brb",
        optionLabel: "Quick break",
        optionEmoji: "☕",
        optionColor: "#B45309",
        firstName: "Ron",
        note: "Coffee run",
      },
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
    const n = WIDGET_DEMO_PRESETS.length;
    const items: FriendStatusWidgetItem[] = Array.from({ length: count }, (_, i) => {
      const preset = WIDGET_DEMO_PRESETS[i % n];
      const usePresetIdentity = i < n;
      const firstName = usePresetIdentity
        ? preset.firstName
        : MOCK_FIRST_NAMES[i % MOCK_FIRST_NAMES.length];
      const note = usePresetIdentity ? preset.note : MOCK_NOTES[i % MOCK_NOTES.length];
      // Staggered future expiries for screenshots — skip for DND: long "until Mon, Apr …" wraps next to "Do not disturb"
      const expiresAt =
        preset.optionId === "dnd"
          ? null
          : new Date(
              Date.now() +
                (2 + (i % 10)) * 3600 * 1000 +
                (i % 3) * 24 * 3600 * 1000 +
                i * 30 * 60 * 1000
            ).toISOString();
      return {
        id: `mock-${i + 1}`,
        firstName,
        lastName:
          !usePresetIdentity && i % 5 === 0
            ? MOCK_LAST_NAMES[Math.floor(i / 5) % MOCK_LAST_NAMES.length]
            : null,
        optionId: preset.optionId,
        optionLabel: preset.optionLabel,
        optionEmoji: preset.optionEmoji,
        optionColor: preset.optionColor,
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
        this.clearIosTimelineReloadPending();
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
        this.clearIosTimelineReloadPending();
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


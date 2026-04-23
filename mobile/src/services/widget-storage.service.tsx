import { Platform } from "react-native";
import { ExtensionStorage } from "@bacons/apple-targets";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Status } from "../types";
import { requestWidgetUpdate } from "react-native-android-widget";
import { renderInstantStatusWidgetForInfo } from "../../android-widget/widget-task-handler";
import Sentry from "../../sentry";
import { WidgetExpiryScheduler } from "../native/WidgetExpiryScheduler";
import { IS_PREMIUM_KEY, WIDGET_DATA_KEY, WIDGET_LOGGED_OUT_KEY, WIDGET_CONFIG_KEY_PREFIX, WIDGET_CONFIG_BACKGROUND_PREFIX } from "../../android-widget/widget-shared";
import type { FriendStatusWidgetItem } from "../../android-widget/InstantStatusWidget";

/** Must match App Group in Apple Developer, app entitlements, and AppGroup.generated.swift (prebuild). */
const APP_GROUP_ID = process.env.EXPO_PUBLIC_IOS_APP_GROUP;
if (!APP_GROUP_ID) {
  // Fail loudly — a missing env var means the RN app would write to a different App Group
  // than the widget reads from, causing the widget to silently show no data in production.
  console.error(
    "[WidgetStorageService] EXPO_PUBLIC_IOS_APP_GROUP is not set. Widget data will not be shared with the iOS widget extension."
  );
}

export class WidgetStorageService {
  private storage: ExtensionStorage | null = null;
  /** iOS: second `reloadTimelines` after a short delay — some iOS 17+ builds coalesce
   *  the first call before the App Group write is visible to the widget extension. */
  private iosReloadFollowUp: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (Platform.OS === "ios" && APP_GROUP_ID) {
      this.storage = new ExtensionStorage(APP_GROUP_ID);
    }
  }

  /**
   * Logout sets `widget_logged_out` so the iOS Notification Service Extension ignores stale pushes.
   * That flag must be cleared as soon as the session is valid again — not only when HomeScreen
   * saves friends — otherwise NSE exits early while the app is backgrounded and the widget never updates.
   */
  clearLoggedOutFlag(): void {
    if (Platform.OS === "ios" && this.storage) {
      this.storage.remove(WIDGET_LOGGED_OUT_KEY);
    }
  }

  /**
   * Android-only: schedule a WorkManager one-shot task that triggers a widget
   * update when a friend's status expires. Survives app process death unlike setTimeout.
   * Calling again for the same userId replaces the existing task (WorkManager REPLACE policy).
   * Passing null expiresAt cancels any pending task for that user.
   */
  private scheduleExpiryReload(userId: string, expiresAt: string | null) {
    if (expiresAt) {
      WidgetExpiryScheduler.schedule(userId, expiresAt);
    } else {
      WidgetExpiryScheduler.cancel(userId);
    }
  }

  /**
   * Android: redraw all home-screen widget instances in the current JS process.
   * `requestWidgetUpdate` with `renderWidget` calls `drawWidgetById` (same data path as
   * `widget-task-handler`: `loadWidgetData` + per-instance `widget_config_{id}`).
   */
  private async triggerAndroidUpdate() {
    try {
      await requestWidgetUpdate({
        widgetName: "InstantStatusWidget",
        renderWidget: renderInstantStatusWidgetForInfo,
      });
    } catch (error) {
      Sentry.captureException(error);
    }
  }

  /**
   * @param options.deferWidgetRefresh When true, persist only — no iOS reload / Android requestWidgetUpdate.
   * Use before an immediate `saveAllFriendStatuses` to avoid two Android updates per FCM.
   */
  async updateFriendStatus(
    userId: string,
    displayName: string,
    optionId: string | null,
    optionLabel: string | null,
    optionEmoji: string | null,
    optionColor: string | null,
    note: string | null,
    expiresAt: string | null,
    timestamp: string,
    options?: { deferWidgetRefresh?: boolean }
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
                           existing.lastName !== friendStatusItem.lastName ||
                           existing.updatedAt !== friendStatusItem.updatedAt;
        if (!hasChanged) return;
        friendsData[friendIndex] = friendStatusItem;
      } else {
        friendsData.push(friendStatusItem);
      }

      const jsonString = JSON.stringify(friendsData);
      const deferRefresh = options?.deferWidgetRefresh === true;

      // 4. Save and ask the OS to redraw. iOS: WidgetCenter reload must run in the same
      // pass as the write, or the widget can stay on the old timeline (debouncing delayed
      // reload for up to 1.5s before). Android: same pass via requestWidgetUpdate + drawWidgetById.
      if (Platform.OS === "ios" && this.storage) {
        this.clearLoggedOutFlag();
        this.storage.set(WIDGET_DATA_KEY, jsonString);
        if (!deferRefresh) {
          await this.reloadWidget();
        }
      } else if (Platform.OS === "android") {
        await AsyncStorage.setItem(WIDGET_DATA_KEY, jsonString);
        if (!deferRefresh) {
          await this.triggerAndroidUpdate();
        }
        // Schedule a widget reload when this friend's status expires so the widget
        // doesn't show stale data if no FCM push arrives at expiry time.
        this.scheduleExpiryReload(userId, expiresAt);
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
        this.clearLoggedOutFlag();
        this.storage.set(WIDGET_DATA_KEY, jsonString);
        await this.reloadWidget();
      } else if (Platform.OS === "android") {
        await AsyncStorage.setItem(WIDGET_DATA_KEY, jsonString);
        await this.triggerAndroidUpdate();
        WidgetExpiryScheduler.cancel(id);
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
        this.clearLoggedOutFlag();
        this.storage.set(WIDGET_DATA_KEY, jsonString);
        await this.reloadWidget();
      } else if (Platform.OS === "android") {
        // Cancel workers for friends that dropped off the list before overwriting.
        const existingRaw = await AsyncStorage.getItem(WIDGET_DATA_KEY);
        if (existingRaw) {
          try {
            const existing: FriendStatusWidgetItem[] = JSON.parse(existingRaw);
            const newIds = new Set(widgetData.map((w) => w.id));
            for (const prev of existing) {
              if (!newIds.has(prev.id)) {
                WidgetExpiryScheduler.cancel(prev.id);
              }
            }
          } catch {
            // malformed storage — skip cancel, proceed with write
          }
        }
        await AsyncStorage.setItem(WIDGET_DATA_KEY, jsonString);
        await this.triggerAndroidUpdate();
        // Reschedule expiry reloads from the latest snapshot so they reflect
        // the current expires_at values, not stale ones from earlier delta pushes.
        for (const item of widgetData) {
          this.scheduleExpiryReload(item.id, item.expiresAt);
        }
      }
    } catch (error) {
      Sentry.captureException(error);
    }
  }

  /**
   * Force widget to reload (e.g. when app comes to foreground to pick up changes).
   * On iOS, schedules a second `WidgetCenter.reloadTimelines` shortly after the first
   * so the home-screen widget is more likely to match fresh App Group data.
   */
  async reloadWidget(): Promise<void> {
    if (Platform.OS === "ios") {
      if (this.iosReloadFollowUp) {
        clearTimeout(this.iosReloadFollowUp);
        this.iosReloadFollowUp = null;
      }
      ExtensionStorage.reloadWidget("InstantStatusWidget");
      this.iosReloadFollowUp = setTimeout(() => {
        this.iosReloadFollowUp = null;
        try {
          ExtensionStorage.reloadWidget("InstantStatusWidget");
        } catch {
          /* native reload best-effort */
        }
      }, 200);
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
        await this.reloadWidget();
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
      if (this.iosReloadFollowUp) {
        clearTimeout(this.iosReloadFollowUp);
        this.iosReloadFollowUp = null;
      }
      if (Platform.OS === "ios" && this.storage) {
        this.storage.set(WIDGET_LOGGED_OUT_KEY, "true");
        this.storage.remove(WIDGET_DATA_KEY);
        this.storage.remove(IS_PREMIUM_KEY);
        ExtensionStorage.reloadWidget("InstantStatusWidget");
      } else if (Platform.OS === "android") {
        await AsyncStorage.removeItem(WIDGET_DATA_KEY);
        await AsyncStorage.removeItem(IS_PREMIUM_KEY);
        // Clear per-widget-instance config keys (selected friends, background style)
        // to prevent stale friend IDs from leaking across sessions.
        const allKeys = await AsyncStorage.getAllKeys();
        const widgetConfigKeys = allKeys.filter(
          (k) => k.startsWith(WIDGET_CONFIG_KEY_PREFIX) || k.startsWith(WIDGET_CONFIG_BACKGROUND_PREFIX),
        );
        if (widgetConfigKeys.length > 0) {
          await AsyncStorage.multiRemove(widgetConfigKeys);
        }
        await this.triggerAndroidUpdate();
      }
    } catch (error) {
      Sentry.captureException(error);
    }
  }
}

export const widgetStorageService = new WidgetStorageService();


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
  /** iOS: timestamp of the last reloadWidget() call. Used to throttle reloads
   *  so rapid-fire calls (app launch, push + sync) coalesce into one,
   *  preserving the WidgetKit daily budget (~40-70 reloads). */
  private lastIosReloadAt = 0;
  private pendingIosReload: ReturnType<typeof setTimeout> | null = null;
  /** Minimum gap between two WidgetCenter.reloadTimelines() calls (ms). */
  private static readonly IOS_RELOAD_THROTTLE_MS = 3000;

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
   * Force widget to reload. iOS calls are throttled (max once per 3s) to preserve
   * the WidgetKit daily budget. Multiple rapid calls coalesce into one trailing reload.
   */
  async reloadWidget(): Promise<void> {
    if (Platform.OS === "ios") {
      // Throttle iOS reloads to preserve the WidgetKit daily budget (~40-70).
      // Multiple calls within the throttle window (e.g. setPremiumStatus then
      // saveAllFriendStatuses on app launch) are coalesced into one trailing call.
      const now = Date.now();
      const elapsed = now - this.lastIosReloadAt;

      if (this.pendingIosReload) {
        clearTimeout(this.pendingIosReload);
        this.pendingIosReload = null;
      }

      if (elapsed >= WidgetStorageService.IOS_RELOAD_THROTTLE_MS) {
        this.lastIosReloadAt = now;
        ExtensionStorage.reloadWidget("InstantStatusWidget");
      } else {
        // Schedule a trailing reload at the end of the throttle window.
        const delay = WidgetStorageService.IOS_RELOAD_THROTTLE_MS - elapsed;
        this.pendingIosReload = setTimeout(() => {
          this.pendingIosReload = null;
          this.lastIosReloadAt = Date.now();
          try {
            ExtensionStorage.reloadWidget("InstantStatusWidget");
          } catch {
            /* best-effort */
          }
        }, delay);
      }
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
   * Clear all widget data (used during logout to prevent data leakage)
   */
  async clearAll(): Promise<void> {
    try {
      if (this.pendingIosReload) {
        clearTimeout(this.pendingIosReload);
        this.pendingIosReload = null;
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


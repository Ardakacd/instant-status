import { NativeModules, Platform } from "react-native";

const { WidgetExpiryScheduler: Native } = NativeModules;

/**
 * Schedules a WorkManager one-shot task that triggers a widget update when
 * a friend's status expires. Android-only; no-ops on iOS (WidgetKit handles
 * expiry natively via timeline scheduling).
 */
export const WidgetExpiryScheduler = {
  /**
   * Schedule (or replace) a widget update at `expiresAt` for `userId`.
   * Safe to call repeatedly — WorkManager replaces the existing task.
   */
  schedule(userId: string, expiresAt: string | null): void {
    if (Platform.OS !== "android" || !Native || !expiresAt) return;
    const expiresAtMs = new Date(expiresAt).getTime();
    if (isNaN(expiresAtMs) || expiresAtMs <= Date.now()) return;
    Native.schedule(userId, expiresAtMs);
  },

  /** Cancel any pending expiry task for `userId`. */
  cancel(userId: string): void {
    if (Platform.OS !== "android" || !Native) return;
    Native.cancel(userId);
  },
};

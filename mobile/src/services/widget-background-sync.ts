import { statusService } from "./status.service";
import { widgetStorageService } from "./widget-storage.service";
import Sentry from "../../sentry";

/**
 * Refreshes widget snapshot from GET /status/friends (used from FCM background).
 * Ensures the widget matches the server even if the push carried a partial delta or ordering was odd.
 * Best-effort: fails quietly (auth not ready, network) — Sentry only.
 */
export async function syncWidgetFriendsFromApiInBackground(): Promise<void> {
  try {
    const statuses = await statusService.getFriendsStatus();
    await widgetStorageService.saveAllFriendStatuses(statuses);
  } catch (e) {
    Sentry.captureException(e);
  }
}

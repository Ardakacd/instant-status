import axios from "axios";
import type { ApiError } from "../config/api";
import { statusService } from "./status.service";
import { widgetStorageService } from "./widget-storage.service";
import Sentry from "../../sentry";

const SYNC_MAX_ATTEMPTS = 3;
/** Delays before attempt 2 and 3 (ms). Gives auth/network time to settle in headless FCM. */
const SYNC_RETRY_DELAYS_MS = [450, 1200];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * True for failures where a short wait may help. Avoids retrying session dead / hard 401.
 */
function isRetriableWidgetSyncError(e: unknown): boolean {
  const ae = e as ApiError;
  if (ae?.isSessionDead) return false;

  if (ae?.isNetworkError) return true;

  if (axios.isAxiosError(e)) {
    if (!e.response) return true;
    const s = e.response.status;
    return s === 408 || s === 429 || s === 502 || s === 503;
  }

  const anyE = e as {
    statusCode?: number;
    originalError?: { response?: { status?: number } };
  };
  const status = anyE.statusCode ?? anyE.originalError?.response?.status;
  if (status === 408 || status === 429 || status === 502 || status === 503) return true;

  return false;
}

/**
 * Refreshes widget snapshot from GET /status/friends (used from FCM background).
 * Ensures the widget matches the server even if the push carried a partial delta or ordering was odd.
 * Retries a few times on transient network / overload — does not fix missing auth (foreground still wins).
 * @returns true if the list was fetched and written (and widget refresh scheduled).
 */
export async function syncWidgetFriendsFromApiInBackground(): Promise<boolean> {
  let lastError: unknown;

  for (let attempt = 0; attempt < SYNC_MAX_ATTEMPTS; attempt++) {
    try {
      const statuses = await statusService.getFriendsStatus();
      await widgetStorageService.saveAllFriendStatuses(statuses);
      return true;
    } catch (e) {
      lastError = e;
      const canRetry =
        attempt < SYNC_MAX_ATTEMPTS - 1 && isRetriableWidgetSyncError(e);
      if (!canRetry) break;
      await sleep(SYNC_RETRY_DELAYS_MS[attempt] ?? 1000);
    }
  }

  if (lastError) Sentry.captureException(lastError);
  return false;
}

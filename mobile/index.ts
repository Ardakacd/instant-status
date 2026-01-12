import { registerRootComponent } from "expo";
import {
  getMessaging,
  setBackgroundMessageHandler,
} from "@react-native-firebase/messaging";
import { widgetStorageService } from "./src/services/widget-storage.service";

import App from "./App";

/**
 * Background Message Handler
 *
 * This handler runs in a "Headless JS" context when the app is closed.
 * It's critical for:
 * 1. Updating widget data (via Shared Storage)
 * 2. Processing notifications while app is force-closed
 * 3. Ensuring data consistency even when app isn't running
 *
 * IMPORTANT: This must be registered BEFORE registerRootComponent
 */
const messagingInstance = getMessaging();
setBackgroundMessageHandler(messagingInstance, async (remoteMessage) => {
  console.log("Message handled in the background!", remoteMessage);

  try {
    // Handle status update notifications
    if (remoteMessage.data?.type === "status_update") {
      const userId = String(remoteMessage.data.user_id || "");
      const displayName =
        typeof remoteMessage.data.display_name === "string"
          ? remoteMessage.data.display_name
          : String(remoteMessage.data.display_name || "");
      const state =
        typeof remoteMessage.data.state === "string"
          ? remoteMessage.data.state
          : String(remoteMessage.data.state || "available");
      // Normalize empty strings to null for consistency
      const noteRaw =
        typeof remoteMessage.data.note === "string"
          ? remoteMessage.data.note
          : null;
      const note = noteRaw && noteRaw.trim() !== "" ? noteRaw : null;

      const expiresAtRaw =
        typeof remoteMessage.data.expires_at === "string"
          ? remoteMessage.data.expires_at
          : null;
      const expiresAt =
        expiresAtRaw && expiresAtRaw.trim() !== "" ? expiresAtRaw : null;
      const timestamp =
        typeof remoteMessage.data.timestamp === "string"
          ? remoteMessage.data.timestamp
          : new Date().toISOString();

      const statusData = {
        user_id: userId,
        display_name: displayName,
        state: state,
        note: note || "",
        timestamp: timestamp,
        expires_at: expiresAt,
      };

      // Update widget storage for iOS
      await widgetStorageService.updateFriendStatus(
        userId,
        displayName,
        state,
        note,
        expiresAt,
        timestamp
      );

      console.log("Status update saved for widget:", statusData);
    }
  } catch (error) {
    console.error("Error handling background message:", error);
  }
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

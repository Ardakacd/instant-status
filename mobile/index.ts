import { registerRootComponent } from "expo";
import { getMessaging, setBackgroundMessageHandler } from "@react-native-firebase/messaging";
import { widgetStorageService } from "./src/services/widget-storage.service";
import { syncWidgetFriendsFromApiInBackground } from "./src/services/widget-background-sync";
import Sentry from "./sentry";
import {
  registerWidgetTaskHandler,
  registerWidgetConfigurationScreen,
} from "react-native-android-widget";
import { widgetTaskHandler } from "./android-widget/widget-task-handler";
import { WidgetConfigurationScreen } from "./android-widget/WidgetConfigurationScreen";

import App from "./App";

/**
 * BACKGROUND MESSAGE HANDLER
 * * This must be defined BEFORE registerRootComponent.
 * It runs in a separate "Headless" context when the app is quit or in the background.
 */
setBackgroundMessageHandler(getMessaging(), async (remoteMessage) => {
  try {
    const data = remoteMessage.data as Record<string, string> | undefined;
    const type = data?.type;

    if (type === "status_update" && data?.user_id) {
      await widgetStorageService.updateFriendStatus(
        String(data.user_id),
        String(data.display_name || ""),
        data.option_id ? String(data.option_id) : null,
        data.option_label ? String(data.option_label) : null,
        data.option_emoji ? String(data.option_emoji) : null,
        data.option_color ? String(data.option_color) : null,
        data.note ? String(data.note) : null,
        data.expires_at ? String(data.expires_at) : null,
        data.timestamp ? String(data.timestamp) : new Date().toISOString(),
        { deferWidgetRefresh: true }
      );
      // Reconcile full list with server (delta push can miss edge cases; iOS may coalesce alerts).
      const synced = await syncWidgetFriendsFromApiInBackground();
      if (!synced) {
        await widgetStorageService.reloadWidget();
      }
    } else if (type === "friend_removed" && data?.peer_user_id) {
      await widgetStorageService.removeFriendFromWidget(String(data.peer_user_id));
      const synced = await syncWidgetFriendsFromApiInBackground();
      if (!synced) {
        await widgetStorageService.reloadWidget();
      }
    } else if (type === "widget_resync_friends") {
      const synced = await syncWidgetFriendsFromApiInBackground();
      if (!synced) {
        await widgetStorageService.reloadWidget();
      }
    } else if (type === "friend_added") {
      const synced = await syncWidgetFriendsFromApiInBackground();
      if (!synced) {
        await widgetStorageService.reloadWidget();
      }
    }
  } catch (error) {
    Sentry.captureException(error);
  }
});

// Standard Expo Entry Point
registerRootComponent(App);

// Android Specific Widget Handlers
registerWidgetTaskHandler(widgetTaskHandler);
registerWidgetConfigurationScreen(WidgetConfigurationScreen);
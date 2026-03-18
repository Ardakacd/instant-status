import { registerRootComponent } from "expo";
import { getMessaging, setBackgroundMessageHandler } from "@react-native-firebase/messaging";
import { widgetStorageService } from "./src/services/widget-storage.service";
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
    // Only process if it's a status update
    if (remoteMessage.data?.type === "status_update") {
      const {
        user_id,
        display_name,
        option_id,
        option_label,
        option_emoji,
        option_color,
        note,
        expires_at,
        timestamp
      } = remoteMessage.data;

      // Update the widget storage (This works for both iOS and Android widgets)
      await widgetStorageService.updateFriendStatus(
        String(user_id || ""),
        String(display_name || ""),
        option_id ? String(option_id) : null,
        option_label ? String(option_label) : null,
        option_emoji ? String(option_emoji) : null,
        option_color ? String(option_color) : null,
        note ? String(note) : null,
        expires_at ? String(expires_at) : null,
        timestamp ? String(timestamp) : new Date().toISOString()
      );

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
import React from "react";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  InstantStatusWidget,
  type FriendStatusWidgetItem,
} from "./InstantStatusWidget";

const WIDGET_DATA_KEY = "widget_status_data";
const WIDGET_CONFIG_KEY_PREFIX = "widget_config_";

/**
 * Map widget width (dp) to layout size, matching iOS small/medium/large.
 * Uses width ranges - launchers vary, so we use conservative boundaries.
 */
function getWidgetLayout(width: number, height: number): "small" | "medium" | "large" {
  // Use the smaller dimension as a proxy when widget is very square
  const minDim = Math.min(width, height);
  // Width is primary for portrait-style widgets; also consider height for large
  if (width < 200 || minDim < 140) return "small";   // ~2 cells
  if (width < 350 && height < 280) return "medium";   // ~4x2
  return "large";
}

const nameToWidget = {
  InstantStatusWidget: InstantStatusWidget,
};

async function loadWidgetData(widgetId: number): Promise<{
  friends: FriendStatusWidgetItem[];
  hasAnyFriends: boolean;
}> {
  try {
    const data = await AsyncStorage.getItem(WIDGET_DATA_KEY);
    if (!data) {
      return {
        friends: [],
        hasAnyFriends: false,
      };
    }

    const allFriends: FriendStatusWidgetItem[] = JSON.parse(data);

    // Load selected friend IDs for this widget
    const configKey = `${WIDGET_CONFIG_KEY_PREFIX}${String(widgetId)}`;
    const savedSelection = await AsyncStorage.getItem(configKey);

    let filteredFriends: FriendStatusWidgetItem[];
    if (savedSelection) {
      // User has selected specific friends
      const selectedIds: string[] = JSON.parse(savedSelection);
      filteredFriends = allFriends.filter((f) => selectedIds.includes(f.id));
    } else {
      // No selection, show first 16 friends (enough for large layout; widget slices by size)
      filteredFriends = allFriends.slice(0, 16);
    }

    return {
      friends: filteredFriends,
      hasAnyFriends: allFriends.length > 0,
    };
  } catch (error) {
    console.error("Error loading widget data:", error);
    return {
      friends: [],
      hasAnyFriends: false,
    };
  }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const widgetInfo = props.widgetInfo;
  const Widget =
    nameToWidget[widgetInfo.widgetName as keyof typeof nameToWidget];
  const layoutSize = getWidgetLayout(widgetInfo.width, widgetInfo.height);

  switch (props.widgetAction) {
    case "WIDGET_ADDED":
      {
        const { friends, hasAnyFriends } = await loadWidgetData(
          widgetInfo.widgetId
        );
        props.renderWidget(
          <Widget
            friends={friends}
            hasAnyFriends={hasAnyFriends}
            layoutSize={layoutSize}
          />
        );
      }
      break;

    case "WIDGET_UPDATE":
      {
        const { friends, hasAnyFriends } = await loadWidgetData(
          widgetInfo.widgetId
        );
        props.renderWidget(
          <Widget
            friends={friends}
            hasAnyFriends={hasAnyFriends}
            layoutSize={layoutSize}
          />
        );
      }
      break;

    case "WIDGET_RESIZED":
      {
        const { friends, hasAnyFriends } = await loadWidgetData(
          widgetInfo.widgetId
        );
        props.renderWidget(
          <Widget
            friends={friends}
            hasAnyFriends={hasAnyFriends}
            layoutSize={layoutSize}
          />
        );
      }
      break;

    case "WIDGET_DELETED":
      {
        // Clean up configuration when widget is deleted
        const configKey = `${WIDGET_CONFIG_KEY_PREFIX}${String(
          widgetInfo.widgetId
        )}`;
        await AsyncStorage.removeItem(configKey);
      }
      break;

    case "WIDGET_CLICK":
      if (props.clickAction === "REFRESH_WIDGET") {
        // Handle refresh button click
        const { friends, hasAnyFriends } = await loadWidgetData(
          widgetInfo.widgetId
        );
        props.renderWidget(
          <Widget
            friends={friends}
            hasAnyFriends={hasAnyFriends}
            layoutSize={layoutSize}
          />
        );
      }
      // Note: For "OPEN_APP" clickAction, the library handles opening the app automatically.
      // We don't need to handle it here, which allows the native intent to proceed normally.
      break;

    default:
      break;
  }
}

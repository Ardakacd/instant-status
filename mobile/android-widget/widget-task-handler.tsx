import React from "react";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  InstantStatusWidget,
  type FriendStatusWidgetItem,
} from "./InstantStatusWidget";

const WIDGET_DATA_KEY = "widget_status_data";
const WIDGET_CONFIG_KEY_PREFIX = "widget_config_";

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
      // No selection, show first 8 friends (default)
      filteredFriends = allFriends.slice(0, 8);
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

  switch (props.widgetAction) {
    case "WIDGET_ADDED":
      {
        const { friends, hasAnyFriends } = await loadWidgetData(
          widgetInfo.widgetId
        );
        props.renderWidget(
          <Widget friends={friends} hasAnyFriends={hasAnyFriends} />
        );
      }
      break;

    case "WIDGET_UPDATE":
      {
        const { friends, hasAnyFriends } = await loadWidgetData(
          widgetInfo.widgetId
        );
        props.renderWidget(
          <Widget friends={friends} hasAnyFriends={hasAnyFriends} />
        );
      }
      break;

    case "WIDGET_RESIZED":
      {
        const { friends, hasAnyFriends } = await loadWidgetData(
          widgetInfo.widgetId
        );
        props.renderWidget(
          <Widget friends={friends} hasAnyFriends={hasAnyFriends} />
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
          <Widget friends={friends} hasAnyFriends={hasAnyFriends} />
        );
      }
      break;

    default:
      break;
  }
}

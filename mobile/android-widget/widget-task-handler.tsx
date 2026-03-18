import React from "react";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  InstantStatusWidget,
  type FriendStatusWidgetItem,
  type WidgetBackgroundStyle,
} from "./InstantStatusWidget";
import Sentry from "../sentry";

const WIDGET_DATA_KEY = "widget_status_data";
const WIDGET_CONFIG_KEY_PREFIX = "widget_config_";
const WIDGET_CONFIG_BACKGROUND_PREFIX = "widget_config_background_";
const IS_PREMIUM_KEY = "is_premium";

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
  isPremium: boolean;
  backgroundStyle: WidgetBackgroundStyle;
}> {
  try {
    const data = await AsyncStorage.getItem(WIDGET_DATA_KEY);
    let allFriends: FriendStatusWidgetItem[] = [];
    if (data) {
      allFriends = JSON.parse(data);
    }

    // Load selected friend IDs for this widget
    const configKey = `${WIDGET_CONFIG_KEY_PREFIX}${String(widgetId)}`;
    const savedSelection = await AsyncStorage.getItem(configKey);

    let filteredFriends: FriendStatusWidgetItem[];
    if (savedSelection) {
      const selectedIds: string[] = JSON.parse(savedSelection);
      filteredFriends = allFriends.filter((f) => selectedIds.includes(f.id));
    } else {
      // No config: use all friends (same as iOS). Widget caps by layout (4/8/16).
      filteredFriends = [...allFriends];
    }

    // Load premium status and background style
    const isPremiumRaw = await AsyncStorage.getItem(IS_PREMIUM_KEY);
    const isPremium = isPremiumRaw === "true";

    const bgKey = `${WIDGET_CONFIG_BACKGROUND_PREFIX}${String(widgetId)}`;
    const savedBg = await AsyncStorage.getItem(bgKey);
    const backgroundStyle: WidgetBackgroundStyle =
      savedBg && isValidBackgroundStyle(savedBg) ? savedBg : "default";

    return {
      friends: filteredFriends,
      hasAnyFriends: allFriends.length > 0,
      isPremium,
      backgroundStyle,
    };
  } catch (error) {
    Sentry.captureException(error);
    return {
      friends: [],
      hasAnyFriends: false,
      isPremium: false,
      backgroundStyle: "default",
    };
  }
}

const VALID_BACKGROUND_STYLES: WidgetBackgroundStyle[] = [
  "default",
  "gradient",
  "contrast",
  "aurora",
  "plum",
  "mermaid",
  "sunset",
  "deepspace",
  "softclay",
];

function isValidBackgroundStyle(s: string): s is WidgetBackgroundStyle {
  return VALID_BACKGROUND_STYLES.includes(s as WidgetBackgroundStyle);
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const widgetInfo = props.widgetInfo;
  const Widget =
    nameToWidget[widgetInfo.widgetName as keyof typeof nameToWidget];
  const layoutSize = getWidgetLayout(widgetInfo.width, widgetInfo.height);

  switch (props.widgetAction) {
    case "WIDGET_ADDED":
      {
        const { friends, hasAnyFriends, isPremium, backgroundStyle } =
          await loadWidgetData(widgetInfo.widgetId);
        props.renderWidget({
          light: (
            <Widget
              friends={friends}
              hasAnyFriends={hasAnyFriends}
              layoutSize={layoutSize}
              isPremium={isPremium}
              backgroundStyle={backgroundStyle}
              isDarkMode={false}
            />
          ),
          dark: (
            <Widget
              friends={friends}
              hasAnyFriends={hasAnyFriends}
              layoutSize={layoutSize}
              isPremium={isPremium}
              backgroundStyle={backgroundStyle}
              isDarkMode={true}
            />
          ),
        });
      }
      break;

    case "WIDGET_UPDATE":
      {
        const { friends, hasAnyFriends, isPremium, backgroundStyle } =
          await loadWidgetData(widgetInfo.widgetId);
        props.renderWidget({
          light: (
            <Widget
              friends={friends}
              hasAnyFriends={hasAnyFriends}
              layoutSize={layoutSize}
              isPremium={isPremium}
              backgroundStyle={backgroundStyle}
              isDarkMode={false}
            />
          ),
          dark: (
            <Widget
              friends={friends}
              hasAnyFriends={hasAnyFriends}
              layoutSize={layoutSize}
              isPremium={isPremium}
              backgroundStyle={backgroundStyle}
              isDarkMode={true}
            />
          ),
        });
      }
      break;

    case "WIDGET_RESIZED":
      {
        const { friends, hasAnyFriends, isPremium, backgroundStyle } =
          await loadWidgetData(widgetInfo.widgetId);
        props.renderWidget({
          light: (
            <Widget
              friends={friends}
              hasAnyFriends={hasAnyFriends}
              layoutSize={layoutSize}
              isPremium={isPremium}
              backgroundStyle={backgroundStyle}
              isDarkMode={false}
            />
          ),
          dark: (
            <Widget
              friends={friends}
              hasAnyFriends={hasAnyFriends}
              layoutSize={layoutSize}
              isPremium={isPremium}
              backgroundStyle={backgroundStyle}
              isDarkMode={true}
            />
          ),
        });
      }
      break;

    case "WIDGET_DELETED":
      {
        const configKey = `${WIDGET_CONFIG_KEY_PREFIX}${String(
          widgetInfo.widgetId
        )}`;
        const bgKey = `${WIDGET_CONFIG_BACKGROUND_PREFIX}${String(
          widgetInfo.widgetId
        )}`;
        await AsyncStorage.removeItem(configKey);
        await AsyncStorage.removeItem(bgKey);
      }
      break;

    case "WIDGET_CLICK":
      if (props.clickAction === "REFRESH_WIDGET") {
        const { friends, hasAnyFriends, isPremium, backgroundStyle } =
          await loadWidgetData(widgetInfo.widgetId);
        props.renderWidget({
          light: (
            <Widget
              friends={friends}
              hasAnyFriends={hasAnyFriends}
              layoutSize={layoutSize}
              isPremium={isPremium}
              backgroundStyle={backgroundStyle}
              isDarkMode={false}
            />
          ),
          dark: (
            <Widget
              friends={friends}
              hasAnyFriends={hasAnyFriends}
              layoutSize={layoutSize}
              isPremium={isPremium}
              backgroundStyle={backgroundStyle}
              isDarkMode={true}
            />
          ),
        });
      }
      // Note: For "OPEN_APP" clickAction, the library handles opening the app automatically.
      // We don't need to handle it here, which allows the native intent to proceed normally.
      break;

    default:
      break;
  }
}

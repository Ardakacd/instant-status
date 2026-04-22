import React from "react";
import type {
  WidgetInfo,
  WidgetRepresentation,
  WidgetTaskHandlerProps,
} from "react-native-android-widget";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  InstantStatusWidget,
  type FriendStatusWidgetItem,
  type WidgetBackgroundStyle,
} from "./InstantStatusWidget";
import {
  WIDGET_DATA_KEY,
  WIDGET_CONFIG_KEY_PREFIX,
  WIDGET_CONFIG_BACKGROUND_PREFIX,
  IS_PREMIUM_KEY,
} from "./widget-shared";
import Sentry from "../sentry";

const VALID_BACKGROUND_STYLES: WidgetBackgroundStyle[] = [
  "default",
  "gradient",
  "aurora",
  "ocean",
  "plum",
  "mermaid",
  "sunset",
  "deepspace",
  "softclay",
];

function isValidBackgroundStyle(s: string): s is WidgetBackgroundStyle {
  return VALID_BACKGROUND_STYLES.includes(s as WidgetBackgroundStyle);
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

    const configKey = `${WIDGET_CONFIG_KEY_PREFIX}${String(widgetId)}`;
    const savedSelection = await AsyncStorage.getItem(configKey);

    let filteredFriends: FriendStatusWidgetItem[];
    if (savedSelection) {
      const selectedIds: string[] = JSON.parse(savedSelection);
      // Match iOS: nil / empty selection = show everyone (ConfigurationAppIntent uses all when empty).
      if (selectedIds.length === 0) {
        filteredFriends = [...allFriends];
      } else {
        filteredFriends = selectedIds
          .map((id) => allFriends.find((f) => f.id === id))
          .filter((f): f is FriendStatusWidgetItem => f != null);
      }
    } else {
      // No config: use all friends (same as iOS). Widget caps by layout.
      filteredFriends = [...allFriends];
    }

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

/**
 * Build light/dark trees for one widget instance — same data path as the task handler
 * (`loadWidgetData` + per-instance config). Use with `requestWidgetUpdate({ renderWidget })`
 * so the main JS runtime draws via `drawWidgetById` immediately after storage writes.
 */
export async function renderInstantStatusWidgetForInfo(
  info: WidgetInfo
): Promise<WidgetRepresentation> {
  const Widget =
    nameToWidget[info.widgetName as keyof typeof nameToWidget];
  if (!Widget) {
    throw new Error(`Unknown Android widget: ${info.widgetName}`);
  }

  const widgetWidthDp = info.width || 200;
  const widgetHeightDp = info.height || 220;

  const { friends, hasAnyFriends, isPremium, backgroundStyle } =
    await loadWidgetData(info.widgetId);

  return {
    light: (
      <Widget
        friends={friends}
        hasAnyFriends={hasAnyFriends}
        isPremium={isPremium}
        backgroundStyle={backgroundStyle}
        isDarkMode={false}
        widgetHeightDp={widgetHeightDp}
        widgetWidthDp={widgetWidthDp}
      />
    ),
    dark: (
      <Widget
        friends={friends}
        hasAnyFriends={hasAnyFriends}
        isPremium={isPremium}
        backgroundStyle={backgroundStyle}
        isDarkMode={true}
        widgetHeightDp={widgetHeightDp}
        widgetWidthDp={widgetWidthDp}
      />
    ),
  };
}

async function renderCurrentWidget(props: WidgetTaskHandlerProps) {
  const representation = await renderInstantStatusWidgetForInfo(
    props.widgetInfo
  );
  props.renderWidget(representation);
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED":
      await renderCurrentWidget(props);
      break;

    case "WIDGET_DELETED": {
      const configKey = `${WIDGET_CONFIG_KEY_PREFIX}${String(
        props.widgetInfo.widgetId
      )}`;
      const bgKey = `${WIDGET_CONFIG_BACKGROUND_PREFIX}${String(
        props.widgetInfo.widgetId
      )}`;
      await AsyncStorage.removeItem(configKey);
      await AsyncStorage.removeItem(bgKey);
      break;
    }

    case "WIDGET_CLICK":
      if (props.clickAction === "REFRESH_WIDGET") {
        await renderCurrentWidget(props);
      }
      // For "OPEN_APP" clickAction, the library handles opening the app automatically.
      break;

    default:
      break;
  }
}

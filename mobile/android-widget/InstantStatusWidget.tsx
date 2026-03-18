"use no memo";
import React from "react";
import {
  FlexWidget,
  TextWidget,
  OverlapWidget,
} from "react-native-android-widget";

export interface FriendStatusWidgetItem {
  id: string;
  firstName: string;
  lastName: string | null;
  optionId: string | null;
  optionLabel: string | null;
  optionEmoji: string | null;
  optionColor: string | null;
  note: string | null;
  expiresAt: string | null;
  updatedAt: string;
}

export type WidgetLayoutSize = "small" | "medium" | "large";

/** Display names for config UI; maps to internal style keys (matches iOS) */
export const WIDGET_BACKGROUND_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "gradient", label: "Mint-Violet" },
  { value: "contrast", label: "Contrast" },
  { value: "aurora", label: "Aurora" },
  { value: "plum", label: "Plum Noir" },
  { value: "mermaid", label: "Mermaidcore" },
  { value: "sunset", label: "Golden Hour" },
  { value: "deepspace", label: "Deep Space" },
  { value: "softclay", label: "Soft Clay" },
] as const;

export type WidgetBackgroundStyle =
  | "default"
  | "gradient"
  | "contrast"
  | "aurora"
  | "plum"
  | "mermaid"
  | "sunset"
  | "deepspace"
  | "softclay";

interface InstantStatusWidgetProps {
  friends?: FriendStatusWidgetItem[];
  hasAnyFriends?: boolean;
  layoutSize?: WidgetLayoutSize;
  backgroundStyle?: WidgetBackgroundStyle;
  isPremium?: boolean;
  /** System dark mode - used for adaptive text/background (default, contrast) */
  isDarkMode?: boolean;
}

function getWidgetBackgroundStyle(
  style: WidgetBackgroundStyle,
  isDarkMode: boolean
): {
  backgroundColor?: `#${string}`;
  backgroundGradient?: {
    from: `#${string}`;
    to: `#${string}`;
    orientation: "TL_BR" | "TOP_BOTTOM";
  };
} {
  switch (style) {
    case "gradient":
      return {
        backgroundGradient: {
          from: "#10B981",
          to: "#A78BFA",
          orientation: "TL_BR",
        },
      };
    case "plum":
      return { backgroundColor: "#2B1538" };
    case "mermaid":
      return {
        backgroundGradient: {
          from: "#7ED4AD",
          to: "#A78BFA",
          orientation: "TL_BR",
        },
      };
    case "sunset":
      return {
        backgroundGradient: {
          from: "#FF5F6D",
          to: "#FFC371",
          orientation: "TOP_BOTTOM",
        },
      };
    case "deepspace":
      return { backgroundColor: "#101417" };
    case "softclay":
      return { backgroundColor: "#F4EBD2" };
    case "contrast":
      return { backgroundColor: isDarkMode ? "#FFFFFF" : "#000000" };
    case "aurora":
      return {
        backgroundGradient: {
          from: "#E0E7FF",
          to: "#FCE7F3",
          orientation: "TL_BR",
        },
      };
    default:
      return { backgroundColor: isDarkMode ? "#121212" : "#FFFFFF" };
  }
}

function getContentColors(style: WidgetBackgroundStyle, isDarkMode: boolean) {
  // Contrast: adaptive (black bg + white text in light, white bg + black text in dark)
  if (style === "contrast") {
    return isDarkMode
      ? {
          primary: "#000000" as const,
          secondary: "rgba(0, 0, 0, 0.75)" as const,
          muted: "#8E8E93" as const,
        }
      : {
          primary: "#FFFFFF" as const,
          secondary: "rgba(255, 255, 255, 0.85)" as const,
          muted: "#8E8E93" as const,
        };
  }
  // Default: adaptive (system background + primary text)
  if (style === "default") {
    return isDarkMode
      ? {
          primary: "#FFFFFF" as const,
          secondary: "rgba(255, 255, 255, 0.85)" as const,
          muted: "#8E8E93" as const,
        }
      : {
          primary: "#000000" as const,
          secondary: "rgba(0, 0, 0, 0.75)" as const,
          muted: "#8E8E93" as const,
        };
  }
  // Fixed dark backgrounds: white text
  const darkStyles: WidgetBackgroundStyle[] = [
    "plum",
    "mermaid",
    "sunset",
    "deepspace",
  ];
  if (darkStyles.includes(style)) {
    return {
      primary: "#FFFFFF" as const,
      secondary: "rgba(255, 255, 255, 0.85)" as const,
      muted: "#8E8E93" as const,
    };
  }
  if (style === "softclay") {
    return {
      primary: "#333333" as const,
      secondary: "rgba(51, 51, 51, 0.75)" as const,
      muted: "#6B7280" as const,
    };
  }
  // Default: aurora, gradient (light backgrounds)
  return {
    primary: "#000000" as const,
    secondary: "rgba(0, 0, 0, 0.75)" as const,
    muted: "#8E8E93" as const,
  };
}

function getEffectiveStatus(friend: FriendStatusWidgetItem): {
  label: string;
  emoji: string;
  color: string;
} {
  // Check if status has expired
  if (friend.expiresAt) {
    const expiryDate = new Date(friend.expiresAt);
    if (expiryDate <= new Date()) {
      // Status expired - return default "Available"
      return {
        label: "Available",
        emoji: "🟢",
        color: "#34C759",
      };
    }
  }

  // Return the friend's current status option, or default to "Available"
  return {
    label: friend.optionLabel || "Available",
    emoji: friend.optionEmoji || "🟢",
    color: friend.optionColor || "#34C759",
  };
}

function formatTimeUntil(expiresAt: string): string {
  try {
    const expiryDate = new Date(expiresAt);
    const now = new Date();

    if (expiryDate <= now) {
      return "";
    }

    const hours = expiryDate.getHours();
    const minutes = expiryDate.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, "0");

    // Check if the date is today
    const isToday =
      expiryDate.getDate() === now.getDate() &&
      expiryDate.getMonth() === now.getMonth() &&
      expiryDate.getFullYear() === now.getFullYear();

    if (isToday) {
      // Show only time if today
      return `until ${displayHours}:${displayMinutes} ${ampm}`;
    } else {
      // Show date and time if not today
      const month = expiryDate.toLocaleDateString(undefined, {
        month: "short",
      });
      const day = expiryDate.getDate();
      return `until ${month} ${day}, ${displayHours}:${displayMinutes} ${ampm}`;
    }
  } catch {
    return "";
  }
}

function FriendRow({
  friend,
  colors,
}: {
  friend: FriendStatusWidgetItem;
  colors: { primary: string; secondary: string; muted: string };
}) {
  const effectiveStatus = getEffectiveStatus(friend);
  const isExpired =
    friend.expiresAt &&
    new Date(friend.expiresAt) <= new Date() &&
    effectiveStatus.label === "Available";

  const statusColor = effectiveStatus.color;
  const displayNote = isExpired
    ? "Available"
    : friend.note || effectiveStatus.label;

  const timeUntil =
    friend.expiresAt && !isExpired ? formatTimeUntil(friend.expiresAt) : "";

  return (
    <FlexWidget
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 6,
      }}
      clickAction="OPEN_APP"
    >
      {/* Status Dot */}
      <FlexWidget
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: statusColor as any,
          marginRight: 8,
        }}
      />

      {/* Name and Note Column */}
      <FlexWidget
        style={{
          flexDirection: "column",
          flex: 1,
        }}
      >
        {/* Name Row with Time Until */}
        <FlexWidget
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 2,
          }}
        >
          <TextWidget
            text={friend.firstName}
            style={{
              fontSize: 13,
              fontWeight: "bold",
              color: (isExpired ? colors.muted : colors.primary) as `#${string}`,
            }}
            maxLines={1}
          />
          {timeUntil && <FlexWidget style={{ flex: 1 }} />}
          {timeUntil && (
            <TextWidget
              text={timeUntil}
              style={{
                fontSize: 9,
                fontWeight: "500",
                color: "#FF9500",
                marginLeft: 4,
              }}
              maxLines={1}
            />
          )}
        </FlexWidget>
        {/* Note */}
        <TextWidget
          text={displayNote}
          style={{
            fontSize: 10,
            color: colors.muted as "#8E8E93" | "#6B7280",
          }}
          maxLines={1}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

const MAX_FRIENDS_BY_LAYOUT: Record<WidgetLayoutSize, number> = {
  small: 4,
  medium: 8,
  large: 16,
};

export function InstantStatusWidget({
  friends = [],
  hasAnyFriends = true,
  layoutSize = "medium",
  backgroundStyle = "default",
  isPremium = false,
  isDarkMode = false,
}: InstantStatusWidgetProps) {
  const maxFriends = layoutSize === "large" ? (isPremium ? 16 : 8) : MAX_FRIENDS_BY_LAYOUT[layoutSize];
  const displayFriends = friends.slice(0, maxFriends);

  const effectiveStyle: WidgetBackgroundStyle =
    isPremium && backgroundStyle ? backgroundStyle : "default";
  const bgStyle = getWidgetBackgroundStyle(effectiveStyle, isDarkMode);
  const colors = getContentColors(effectiveStyle, isDarkMode);

  const hasLightBackground =
    (effectiveStyle === "default" && !isDarkMode) ||
    effectiveStyle === "aurora" ||
    (effectiveStyle === "contrast" && isDarkMode) ||
    effectiveStyle === "softclay";

  if (displayFriends.length === 0) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          height: "match_parent",
          width: "match_parent",
          justifyContent: "center",
          alignItems: "center",
          borderRadius: 16,
          padding: 16,
          ...bgStyle,
        }}
      >
        <FlexWidget
          style={{
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <TextWidget
            text={hasAnyFriends ? "No friends selected" : "Add some friends"}
            style={{
              fontSize: 13,
              fontWeight: "500",
              color: colors.muted,
              marginBottom: 4,
            }}
          />
          <TextWidget
            text={
              hasAnyFriends ? "Hold to select" : "Open the app to get started"
            }
            style={{
              fontSize: 11,
              color: colors.muted,
            }}
          />
        </FlexWidget>
      </FlexWidget>
    );
  }

  return (
    <OverlapWidget
      clickAction="OPEN_APP"
      style={{
        height: "match_parent",
        width: "match_parent",
        borderRadius: 16,
        padding: 16,
        ...bgStyle,
      }}
    >
      {/* Content */}
      <FlexWidget
        style={{
          flexDirection: "column",
          paddingTop: displayFriends.length > 0 ? 28 : 0,
          paddingBottom: 8,
        }}
      >
        {displayFriends.map((friend) => (
          <FriendRow key={friend.id} friend={friend} colors={colors} />
        ))}
      </FlexWidget>

      {/* Refresh Button - Top Right */}
      {displayFriends.length > 0 && (
        <FlexWidget
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            marginTop: 4,
            marginRight: 4,
            width: "match_parent",
          }}
        >
          <FlexWidget
            clickAction="REFRESH_WIDGET"
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: hasLightBackground
                ? "#F3F4F6"
                : ("rgba(255, 255, 255, 0.2)" as const),
              justifyContent: "center",
              alignItems: "center",
              padding: 4,
            }}
          >
            <TextWidget
              text="↻"
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: colors.muted,
              }}
            />
          </FlexWidget>
        </FlexWidget>
      )}
    </OverlapWidget>
  );
}

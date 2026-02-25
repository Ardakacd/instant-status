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

interface InstantStatusWidgetProps {
  friends?: FriendStatusWidgetItem[];
  hasAnyFriends?: boolean;
  layoutSize?: WidgetLayoutSize;
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

function FriendRow({ friend }: { friend: FriendStatusWidgetItem }) {
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
              color: isExpired ? "#8E8E93" : "#000000",
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
            color: "#8E8E93",
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
}: InstantStatusWidgetProps) {
  const maxFriends = MAX_FRIENDS_BY_LAYOUT[layoutSize];
  const displayFriends = friends.slice(0, maxFriends);

  if (displayFriends.length === 0) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          height: "match_parent",
          width: "match_parent",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#FFFFFF",
          borderRadius: 16,
          padding: 16,
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
              color: "#8E8E93",
              marginBottom: 4,
            }}
          />
          <TextWidget
            text={
              hasAnyFriends ? "Hold to select" : "Open the app to get started"
            }
            style={{
              fontSize: 11,
              color: "#8E8E93",
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
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        padding: 16,
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
        {displayFriends.map((friend, index) => {
          return <FriendRow key={friend.id} friend={friend} />;
        })}
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
              backgroundColor: "#F3F4F6",
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
                color: "#8E8E93",
              }}
            />
          </FlexWidget>
        </FlexWidget>
      )}
    </OverlapWidget>
  );
}

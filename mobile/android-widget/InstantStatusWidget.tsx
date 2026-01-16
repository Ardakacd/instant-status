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
  state: string;
  note: string | null;
  expiresAt: string | null;
  updatedAt: string;
}

interface InstantStatusWidgetProps {
  friends?: FriendStatusWidgetItem[];
  hasAnyFriends?: boolean;
}

function getStatusColor(state: string): string {
  switch (state.toLowerCase()) {
    case "available":
      return "#34C759"; // Green
    case "busy":
      return "#FF9500"; // Orange
    case "dnd":
      return "#FF3B30"; // Red
    case "focus":
      return "#5856D6"; // Indigo
    case "social":
      return "#FF2D92"; // Pink
    case "commute":
      return "#007AFF"; // Blue
    default:
      return "#8E8E93"; // Gray
  }
}

function getEffectiveState(friend: FriendStatusWidgetItem): string {
  if (friend.expiresAt) {
    const expiryDate = new Date(friend.expiresAt);
    if (expiryDate <= new Date()) {
      return "available";
    }
  }
  return friend.state.toLowerCase();
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
  const effectiveState = getEffectiveState(friend);
  const isExpired =
    effectiveState === "available" &&
    friend.state.toLowerCase() !== "available" &&
    friend.expiresAt &&
    new Date(friend.expiresAt) <= new Date();

  const statusColor = getStatusColor(effectiveState);
  const displayNote = isExpired
    ? "Available"
    : friend.note ||
      effectiveState.charAt(0).toUpperCase() + effectiveState.slice(1);

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

export function InstantStatusWidget({
  friends = [],
  hasAnyFriends = true,
}: InstantStatusWidgetProps) {
  // Show max 8 friends like iOS medium widget
  const displayFriends = friends.slice(0, 8);

  // Debug: Log how many friends we're displaying
  if (friends.length > 0) {
    console.log(
      `Widget: Rendering ${displayFriends.length} out of ${friends.length} friends`
    );
  }

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
          // Debug: Log each friend being rendered
          console.log(
            `Widget: Rendering friend ${index + 1}: ${friend.firstName}`
          );
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

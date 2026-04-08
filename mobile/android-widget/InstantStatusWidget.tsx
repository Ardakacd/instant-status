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
  { value: "aurora", label: "Aurora" },
  { value: "ocean", label: "Ocean" },
  { value: "plum", label: "Plum Noir" },
  { value: "mermaid", label: "Mermaidcore" },
  { value: "sunset", label: "Golden Hour" },
  { value: "deepspace", label: "Deep Space" },
  { value: "softclay", label: "Soft Clay" },
] as const;

export type WidgetBackgroundStyle =
  | "default"
  | "gradient"
  | "aurora"
  | "ocean"
  | "plum"
  | "mermaid"
  | "sunset"
  | "deepspace"
  | "softclay";

interface InstantStatusWidgetProps {
  friends?: FriendStatusWidgetItem[];
  hasAnyFriends?: boolean;
  backgroundStyle?: WidgetBackgroundStyle;
  isPremium?: boolean;
  /** System dark mode - used for adaptive text/background (default) */
  isDarkMode?: boolean;
  /** Actual widget dimensions in dp. Width drives columns; height drives rows. */
  widgetHeightDp?: number;
  widgetWidthDp?: number;
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
          from: "#047857",
          to: "#5B21B6",
          orientation: "TL_BR",
        },
      };
    case "plum":
      return { backgroundColor: "#2B1538" };
    case "mermaid":
      return { backgroundColor: "#0E7490" };
    case "sunset":
      return {
        backgroundGradient: {
          from: "#E11D48",
          to: "#EA580C",
          orientation: "TOP_BOTTOM",
        },
      };
    case "deepspace":
      return { backgroundColor: "#101417" };
    case "softclay":
      return { backgroundColor: "#F4EBD2" };
    case "ocean":
      return {
        backgroundGradient: {
          from: "#0EA5E9",
          to: "#06B6D4",
          orientation: "TL_BR",
        },
      };
    case "aurora":
      return {
        backgroundGradient: {
          from: "#C7D2FE",
          to: "#F9A8D4",
          orientation: "TL_BR",
        },
      };
    default:
      return { backgroundColor: isDarkMode ? "#121212" : "#FFFFFF" };
  }
}

function getContentColors(style: WidgetBackgroundStyle, isDarkMode: boolean) {
  // Default: adaptive (system background + primary text)
  if (style === "default") {
    return isDarkMode
      ? {
          primary: "#FFFFFF" as const,
          secondary: "rgba(255, 255, 255, 0.85)" as const,
          muted: "#8E8E93" as const,
          expiry: "#FF9500" as const,
        }
      : {
          primary: "#000000" as const,
          secondary: "rgba(0, 0, 0, 0.75)" as const,
          muted: "#8E8E93" as const,
          expiry: "#FF9500" as const,
        };
  }
  // Dark / vivid backgrounds — primary always white, muted always light gray
  // so status text is readable regardless of the background hue.
  switch (style) {
    case "gradient": // dark green → dark violet
      return {
        primary: "#FFFFFF" as const,
        secondary: "rgba(255, 255, 255, 0.85)" as const,
        muted: "#D1FAE5" as const,   // very light mint — lifts text off dark green/violet
        expiry: "#FFD60A" as const,  // yellow
      };
    case "plum": // #2B1538 dark purple
      return {
        primary: "#FFFFFF" as const,
        secondary: "rgba(255, 255, 255, 0.85)" as const,
        muted: "#E9D5FF" as const,   // light lavender — harmonises with purple bg
        expiry: "#FFD60A" as const,
      };
    case "mermaid": // #0E7490 medium teal
      return {
        primary: "#FFFFFF" as const,
        secondary: "rgba(255, 255, 255, 0.85)" as const,
        muted: "#CFFAFE" as const,   // very light cyan — lifts off teal bg
        expiry: "#FFD60A" as const,
      };
    case "ocean": // #0EA5E9 → #06B6D4 bright blue/cyan
      return {
        primary: "#FFFFFF" as const,
        secondary: "rgba(255, 255, 255, 0.85)" as const,
        muted: "#E0F2FE" as const,   // very light sky blue — clearly readable on bright blue
        expiry: "#FFD60A" as const,
      };
    case "sunset": // #E11D48 → #EA580C vivid red/orange
      return {
        primary: "#FFFFFF" as const,
        secondary: "rgba(255, 255, 255, 0.85)" as const,
        muted: "#FFE4E6" as const,   // very light rose — readable on red/orange
        expiry: "#FEF08A" as const,  // light yellow — distinct from white primary
      };
    case "deepspace": // #101417 near-black
      return {
        primary: "#FFFFFF" as const,
        secondary: "rgba(255, 255, 255, 0.85)" as const,
        muted: "#9CA3AF" as const,   // medium-light gray — fine on near-black
        expiry: "#67E8F9" as const,  // cyan
      };
    case "softclay": // #F4EBD2 warm cream
      return {
        primary: "#333333" as const,
        secondary: "rgba(51, 51, 51, 0.75)" as const,
        muted: "#6B7280" as const,
        expiry: "#0369A1" as const,
      };
    case "aurora": // #C7D2FE → #F9A8D4 light lavender/pink
      return {
        primary: "#1F2937" as const,
        secondary: "rgba(31, 41, 55, 0.75)" as const,
        muted: "#4B5563" as const,   // dark gray — readable on light pastel bg
        expiry: "#4338CA" as const,  // deep indigo
      };
  }
  // default and aurora (handled above) — light backgrounds
  return {
    primary: "#000000" as const,
    secondary: "rgba(0, 0, 0, 0.75)" as const,
    muted: "#8E8E93" as const,
    expiry: "#FF9500" as const,
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

/** Short time string respecting device 12h/24h (system locale default). */
function formatExpiryClock(isoDate: Date): string {
  return isoDate.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimeUntil(expiresAt: string): string {
  try {
    const expiryDate = new Date(expiresAt);
    const now = new Date();

    if (expiryDate <= now) {
      return "";
    }

    const timeStr = formatExpiryClock(expiryDate);

    const isToday =
      expiryDate.getDate() === now.getDate() &&
      expiryDate.getMonth() === now.getMonth() &&
      expiryDate.getFullYear() === now.getFullYear();

    if (isToday) {
      return `until ${timeStr}`;
    }
    const month = expiryDate.toLocaleDateString(undefined, {
      month: "short",
    });
    const day = expiryDate.getDate();
    return `until ${month} ${day}, ${timeStr}`;
  } catch {
    return "";
  }
}

function hasNonEmptyNote(friend: FriendStatusWidgetItem): boolean {
  const n = friend.note?.trim();
  return Boolean(n);
}

function FriendRow({
  friend,
  colors,
  showExpiry = true,
}: {
  friend: FriendStatusWidgetItem;
  colors: { primary: string; secondary: string; muted: string; expiry: string };
  /** Small widget: hide "until …" to save space (matches iOS). */
  showExpiry?: boolean;
}) {
  const effectiveStatus = getEffectiveStatus(friend);
  const isExpired =
    friend.expiresAt &&
    new Date(friend.expiresAt) <= new Date() &&
    effectiveStatus.label === "Available";

  const displayStatus = isExpired
    ? "Available"
    : effectiveStatus.label;

  const timeUntil =
    showExpiry && friend.expiresAt && !isExpired
      ? formatTimeUntil(friend.expiresAt)
      : "";

  return (
    <FlexWidget
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 0,
        width: "match_parent",
      }}
      clickAction="OPEN_APP"
    >
      {/* Status Emoji */}
      <TextWidget
        text={effectiveStatus.emoji}
        style={{
          fontSize: 12,
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
          {hasNonEmptyNote(friend) ? (
            <TextWidget
              text="📝"
              style={{
                fontSize: 10,
                marginLeft: 3,
                color: colors.muted as `#${string}`,
              }}
            />
          ) : null}
          {timeUntil && <FlexWidget style={{ flex: 1 }} />}
          {timeUntil && (
            <TextWidget
              text={timeUntil}
              style={{
                fontSize: 9,
                fontWeight: "500",
                color: colors.expiry as `#${string}`,
                marginLeft: 4,
              }}
              maxLines={1}
            />
          )}
        </FlexWidget>
        {/* Note */}
        <TextWidget
          text={displayStatus}
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

/** Compact cell for medium 2-column layout — matches iOS medium style. */
function MediumFriendCell({
  friend,
  colors,
  showExpiry = true,
}: {
  friend: FriendStatusWidgetItem;
  colors: { primary: string; secondary: string; muted: string; expiry: string };
  showExpiry?: boolean;
}) {
  const effectiveStatus = getEffectiveStatus(friend);
  const isExpired =
    friend.expiresAt &&
    new Date(friend.expiresAt) <= new Date() &&
    effectiveStatus.label === "Available";
  const displayStatus = isExpired ? "Available" : effectiveStatus.label;
  const timeUntil =
    showExpiry && friend.expiresAt && !isExpired ? formatTimeUntil(friend.expiresAt) : "";

  return (
    <FlexWidget
      style={{
        flexDirection: "row",
        alignItems: "center",
        width: "match_parent",
      }}
      clickAction="OPEN_APP"
    >
      <TextWidget
        text={effectiveStatus.emoji}
        style={{ fontSize: 11, marginRight: 5 }}
      />
      <FlexWidget style={{ flexDirection: "column", flex: 1, alignItems: "flex-start" }}>
        <FlexWidget
          style={{ flexDirection: "row", alignItems: "center", marginBottom: 1 }}
        >
          <FlexWidget style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
            <TextWidget
              text={friend.firstName}
              style={{
                fontSize: 11,
                fontWeight: "bold",
                color: (isExpired ? colors.muted : colors.primary) as `#${string}`,
              }}
              maxLines={1}
            />
            {hasNonEmptyNote(friend) ? (
              <TextWidget
                text="📝"
                style={{ fontSize: 8, marginLeft: 2, color: colors.muted as `#${string}` }}
              />
            ) : null}
          </FlexWidget>
          {timeUntil ? <FlexWidget style={{ width: 4 }} /> : null}
          {timeUntil ? (
            <TextWidget
              text={timeUntil}
              style={{ fontSize: 8, fontWeight: "500", color: colors.expiry as `#${string}`, marginLeft: 3 }}
              maxLines={1}
            />
          ) : null}
        </FlexWidget>
        <TextWidget
          text={displayStatus}
          style={{ fontSize: 9, color: colors.muted as `#${string}` }}
          maxLines={1}
        />
      </FlexWidget>
    </FlexWidget>
  );
}


// ---------------------------------------------------------------------------
// Dimension → layout mapping
// Android widget cells are approximately:
//   Width:  ~73–110 dp per grid cell (varies by launcher / screen width)
//   Height: ~116–120 dp per grid cell
//
// Columns: ~130 dp per column is a comfortable cell width across phones.
// Math.round gives natural breakpoints: <65→1, 65–195→1, 195–260→2, >260→3 etc.
// Capped at 1–3.
function getColCount(widthDp: number): 1 | 2 | 3 {
  const cols = Math.round(widthDp / 130);
  return Math.max(1, Math.min(3, cols)) as 1 | 2 | 3;
}

// Rows: subtract fixed overhead (refresh button + padding) then divide by
// ~50 dp per row. Floor so we never show a row that doesn't fully fit.
// Capped at 3–10.
function getRowCount(heightDp: number): number {
  const OVERHEAD = 56;
  const ROW_HEIGHT = 50;
  return Math.max(3, Math.min(10, Math.floor((heightDp - OVERHEAD) / ROW_HEIGHT)));
}


/** Compact cell for 3-column layout. */
function LargeGridFriendCell({
  friend,
  colors,
  showExpiry = true,
}: {
  friend: FriendStatusWidgetItem;
  colors: { primary: string; secondary: string; muted: string; expiry: string };
  showExpiry?: boolean;
}) {
  const effectiveStatus = getEffectiveStatus(friend);
  const isExpired =
    friend.expiresAt &&
    new Date(friend.expiresAt) <= new Date() &&
    effectiveStatus.label === "Available";

  const displayStatus = isExpired ? "Available" : effectiveStatus.label;

  const timeUntil =
    showExpiry && friend.expiresAt && !isExpired ? formatTimeUntil(friend.expiresAt) : "";

  return (
    <FlexWidget
      style={{
        flexDirection: "column",
        alignItems: "flex-start",
        width: "match_parent",
      }}
      clickAction="OPEN_APP"
    >
      <FlexWidget
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 1,
          width: "match_parent",
        }}
      >
        <TextWidget
          text={effectiveStatus.emoji}
          style={{ fontSize: 10, marginRight: 3 }}
        />
        <FlexWidget style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
          <TextWidget
            text={friend.firstName}
            style={{
              fontSize: 10,
              fontWeight: "bold",
              color: (isExpired ? colors.muted : colors.primary) as `#${string}`,
            }}
            maxLines={1}
          />
          {hasNonEmptyNote(friend) ? (
            <TextWidget
              text="📝"
              style={{
                fontSize: 8,
                marginLeft: 2,
                color: colors.muted as `#${string}`,
              }}
            />
          ) : null}
        </FlexWidget>
      </FlexWidget>
      <TextWidget
        text={displayStatus}
        style={{
          fontSize: 8,
          color: colors.muted as `#${string}`,
        }}
        maxLines={1}
      />
      {/* Always render this line so every cell has the same height.
          When there is no expiry, a single space holds the vertical space invisibly. */}
      <TextWidget
        text={timeUntil || " "}
        style={{
          fontSize: 7,
          fontWeight: "500",
          color: (timeUntil ? colors.expiry : "#00000000") as `#${string}`,
        }}
        maxLines={1}
      />
    </FlexWidget>
  );
}

export function InstantStatusWidget({
  friends = [],
  hasAnyFriends = true,
  backgroundStyle = "default",
  isPremium = false,
  isDarkMode = false,
  widgetHeightDp,
  widgetWidthDp,
}: InstantStatusWidgetProps) {
  const cols = getColCount(widgetWidthDp ?? 200);
  const rows = getRowCount(widgetHeightDp ?? 220);

  const isLargeGrid = cols === 3;
  const isTwoCol    = cols === 2;
  const showExpiry  = cols > 1; // single-col is compact; multi-col always shows expiry

  const displayFriends = friends.slice(0, rows * cols);

  const effectiveStyle: WidgetBackgroundStyle =
    isPremium && backgroundStyle ? backgroundStyle : "default";
  const bgStyle = getWidgetBackgroundStyle(effectiveStyle, isDarkMode);
  const colors = getContentColors(effectiveStyle, isDarkMode);

  const hasLightBackground =
    (effectiveStyle === "default" && !isDarkMode) ||
    effectiveStyle === "aurora" ||
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

  // Split friends into columns — distribute as evenly as possible so no column
  // is more than 1 item taller than any other (same as Math.ceil spreading).
  const n = displayFriends.length;
  const col1Count = Math.ceil(n / cols);
  const col2Count = isTwoCol ? n - col1Count : Math.ceil((n - col1Count) / 2);
  const col1 = displayFriends.slice(0, col1Count);
  const col2 = isTwoCol || isLargeGrid ? displayFriends.slice(col1Count, col1Count + col2Count) : [];
  const col3 = isLargeGrid ? displayFriends.slice(col1Count + col2Count) : [];

  return (
    <OverlapWidget
      clickAction="OPEN_APP"
      style={{
        height: "match_parent",
        width: "match_parent",
        borderRadius: 16,
        padding: cols === 3 ? 8 : 16,
        ...bgStyle,
      }}
    >
      {/* Content */}
      <FlexWidget
        style={{
          flexDirection: "column",
          width: "match_parent",
          height: "match_parent",
          paddingTop: displayFriends.length > 0 ? 28 : 0,
          paddingBottom: 8,
          justifyContent: cols === 1 ? "space-evenly" : "flex-start",
        }}
      >
        {isLargeGrid ? (
          // 3-column layout
          <FlexWidget style={{ flexDirection: "row", flex: 1, width: "match_parent", height: "match_parent" }}>
            <FlexWidget style={{ flex: 1, flexDirection: "column", height: "match_parent", justifyContent: "space-evenly" }}>
              {col1.map((friend) => <LargeGridFriendCell key={friend.id} friend={friend} colors={colors} showExpiry={showExpiry} />)}
            </FlexWidget>
            <FlexWidget style={{ width: 6 }} />
            <FlexWidget style={{ flex: 1, flexDirection: "column", height: "match_parent", justifyContent: "space-evenly" }}>
              {col2.map((friend) => <LargeGridFriendCell key={friend.id} friend={friend} colors={colors} showExpiry={showExpiry} />)}
            </FlexWidget>
            <FlexWidget style={{ width: 6 }} />
            <FlexWidget style={{ flex: 1, flexDirection: "column", height: "match_parent", justifyContent: "space-evenly" }}>
              {col3.map((friend) => <LargeGridFriendCell key={friend.id} friend={friend} colors={colors} showExpiry={showExpiry} />)}
            </FlexWidget>
          </FlexWidget>
        ) : isTwoCol ? (
          // 2-column layout
          <FlexWidget style={{ flexDirection: "row", flex: 1, width: "match_parent", height: "match_parent" }}>
            <FlexWidget style={{ flex: 1, flexDirection: "column", height: "match_parent", justifyContent: "space-evenly" }}>
              {col1.map((friend) => <MediumFriendCell key={friend.id} friend={friend} colors={colors} showExpiry={showExpiry} />)}
            </FlexWidget>
            <FlexWidget style={{ width: 12 }} />
            <FlexWidget style={{ flex: 1, flexDirection: "column", height: "match_parent", justifyContent: "space-evenly" }}>
              {col2.map((friend) => <MediumFriendCell key={friend.id} friend={friend} colors={colors} showExpiry={showExpiry} />)}
            </FlexWidget>
          </FlexWidget>
        ) : (
          // Small: single column list, no expiry text
          displayFriends.map((friend) => (
            <FriendRow
              key={friend.id}
              friend={friend}
              colors={colors}
              showExpiry={false}
            />
          ))
        )}
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

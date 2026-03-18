/**
 * Responsive design utilities
 *
 * Provides layout helpers for different phone screen sizes.
 * Use useResponsive() in components to adapt layout to screen dimensions.
 */

import { useWindowDimensions } from "react-native";
import { useMemo } from "react";
import { Spacing } from "./tokens";

/**
 * Design base width (iPhone 14/15, 390pt).
 * All font sizes and dimensions are designed at this width.
 */
const BASE_WIDTH = 390;

/**
 * Breakpoints (width in pt).
 * small : original iPhone SE and older (320pt)
 * large : iPhone Pro Max / Plus and wide Android phones (428pt+)
 */
export const Breakpoints = {
  small: 375,
  large: 428,
} as const;

/**
 * Returns responsive layout values based on current window dimensions.
 * Re-renders when screen size changes (orientation, split screen, etc.).
 *
 * fs(size) — proportionally scales a size relative to the 390pt design base,
 * clamped to ±12% so it never gets too small or too large.
 * Examples at common widths:
 *   320pt (SE 1st gen) → scale 0.88  → fs(28) = 25
 *   375pt (SE 2nd gen) → scale 0.96  → fs(28) = 27
 *   390pt (iPhone 14)  → scale 1.00  → fs(28) = 28
 *   430pt (Pro Max)    → scale 1.10  → fs(28) = 31
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isSmallScreen = width < Breakpoints.small;
    const isLargeScreen = width >= Breakpoints.large;

    // Horizontal padding: tighter on small screens, more generous on large screens
    const horizontalPadding = isSmallScreen
      ? Spacing.md
      : isLargeScreen
      ? Spacing.xl
      : Spacing.lg;

    // Proportional font/size scaler, clamped to [0.88, 1.10]
    const scale = Math.min(Math.max(width / BASE_WIDTH, 0.88), 1.1);
    const fs = (size: number) => Math.round(size * scale);

    return {
      width,
      height,
      isSmallScreen,
      isLargeScreen,
      horizontalPadding,
      fs,
    };
  }, [width, height]);
}


/**
 * Responsive design utilities
 *
 * Provides layout helpers for different phone screen sizes.
 * Use useResponsive() in components to adapt layout to screen dimensions.
 */

import { useWindowDimensions } from "react-native";
import { useMemo } from "react";
import { Spacing } from "./tokens";

/** Breakpoints (width in px) */
export const Breakpoints = {
  small: 375,
  medium: 414,
} as const;

/**
 * Returns responsive layout values based on current window dimensions.
 * Re-renders when screen size changes (orientation, split screen, etc.).
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isSmallScreen = width < Breakpoints.small;

    // Horizontal padding: less on small screens
    const horizontalPadding = isSmallScreen ? Spacing.md : Spacing.lg;

    return {
      width,
      height,
      isSmallScreen,
      horizontalPadding,
    };
  }, [width, height]);
}


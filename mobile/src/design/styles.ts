/**
 * Design System Styles
 * 
 * Reusable style definitions based on design tokens.
 * These enforce the design contract across the app.
 */

import { StyleSheet } from 'react-native';
import { Colors, Borders, Typography, Spacing, PhysicalShift } from './tokens';

/**
 * Base text styles following typography rules
 */
export const TextStyles = StyleSheet.create({
  heading: {
    fontFamily: Typography.fontFamily.semiBold, // Headings use semiBold (600)
    fontSize: 20,
    lineHeight: 20 * Typography.lineHeight.heading,
    color: Colors.text.primary,
  },
  body: {
    fontFamily: Typography.fontFamily.regular, // Body uses regular (400)
    fontSize: 16,
    lineHeight: 16 * Typography.lineHeight.default,
    color: Colors.text.primary,
  },
  bodySecondary: {
    fontFamily: Typography.fontFamily.regular, // Body uses regular (400)
    fontSize: 16,
    lineHeight: 16 * Typography.lineHeight.default,
    color: Colors.text.secondary,
  },
  cta: {
    fontFamily: Typography.fontFamily.medium, // CTA uses medium (500)
    fontSize: 16,
    lineHeight: 16 * Typography.lineHeight.default,
    color: Colors.canvas.background,
  },
  label: {
    fontFamily: Typography.fontFamily.regular, // Labels use regular (400)
    fontSize: 14,
    lineHeight: 14 * Typography.lineHeight.default,
    color: Colors.text.secondary,
  },
});

/**
 * Container styles
 */
export const ContainerStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.canvas.background,
  },
  card: {
    backgroundColor: Colors.canvas.background,
    borderRadius: Borders.radius.medium,
    borderWidth: Borders.width,
    borderColor: Colors.text.secondary,
  },
  cardLarge: {
    backgroundColor: Colors.canvas.background,
    borderRadius: Borders.radius.large,
    borderWidth: Borders.width,
    borderColor: Colors.text.secondary,
  },
});

/**
 * Button styles following physical shift rules
 */
export const ButtonStyles = StyleSheet.create({
  primary: {
    backgroundColor: Colors.interaction.primary,
    borderRadius: Borders.radius.medium,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    // Physical shift: 4px right, 4px down
    // Implemented via transform in component (NOT elevation prop)
  },
  primaryText: {
    ...TextStyles.cta,
  },
  disabled: {
    backgroundColor: Colors.interaction.disabled,
    borderRadius: Borders.radius.medium,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  disabledText: {
    ...TextStyles.cta,
    color: Colors.text.secondary,
  },
});

/**
 * Input styles
 */
export const InputStyles = StyleSheet.create({
  default: {
    borderWidth: Borders.width,
    borderColor: Colors.text.secondary,
    borderRadius: Borders.radius.medium,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontFamily: Typography.fontFamily.regular, // Inputs use regular (400)
    fontSize: 16,
    color: Colors.text.primary,
    backgroundColor: Colors.canvas.background,
  },
  disabled: {
    borderWidth: Borders.width,
    borderColor: Colors.interaction.disabled,
    borderRadius: Borders.radius.medium,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontFamily: Typography.fontFamily.regular, // Inputs use regular (400)
    fontSize: 16,
    color: Colors.interaction.disabled,
    backgroundColor: Colors.canvas.background,
  },
});

/**
 * Helper function to create physical shift transform
 * Physical offset: 4px right, 4px down
 * 
 * Note: We use transform, NOT React Native's `elevation` prop.
 * The `elevation` prop on Android creates unwanted material design shadows.
 * 
 * IMPORTANT: This function only handles the foreground movement.
 * For the full physical shift effect, components must implement a two-layer approach:
 * 1. A static shadow block (background layer) positioned absolutely
 * 2. The moving foreground element using this transform
 * 
 * See Card and Button components for reference implementation.
 */
export const createPhysicalShiftTransform = (pressed: boolean = false) => {
  if (pressed) {
    // Pressed state: foreground moves down-right to cover the shadow block
    return {
      transform: [
        { translateX: PhysicalShift.offset.x },
        { translateY: PhysicalShift.offset.y },
      ],
    };
  }
  // Default state: foreground at origin, shadow peeks from bottom-right
  return {
    transform: [{ translateX: 0 }, { translateY: 0 }],
  };
};

/**
 * Legacy function name for backwards compatibility
 * @deprecated Use createPhysicalShiftTransform instead
 */
export const createElevationTransform = createPhysicalShiftTransform;

/**
 * Color Contrast Helper
 * 
 * Determines the appropriate text color (Charcoal or White) based on background color luminance.
 * Uses the YIQ color space formula for accurate contrast calculation.
 * 
 * @param hexColor - Hex color string (e.g., "#10B981" or "#EF4444")
 * @returns Colors.text.primary (Charcoal) for light backgrounds, Colors.canvas.background (White) for dark backgrounds
 * 
 * Usage:
 * ```typescript
 * const textColor = getContrastingTextColor(statusColor);
 * <Text style={{ color: textColor }}>Status Text</Text>
 * ```
 */
export const getContrastingTextColor = (hexColor: string): string => {
  // Standard luminance formula (YIQ color space)
  // Extract RGB values from hex color
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  
  // Calculate relative luminance using YIQ formula
  // YIQ weights: Red (299), Green (587), Blue (114)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  
  // If dark background (YIQ < 128), return white text
  // If light background (YIQ >= 128), return Charcoal text
  return yiq >= 128 ? Colors.text.primary : Colors.canvas.background;
};


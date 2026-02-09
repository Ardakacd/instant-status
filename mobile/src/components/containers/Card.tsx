/**
 * Card Container Component
 * 
 * Used for:
 * - Status
 * - Friend status
 * - Info blocks
 * - Paywall sections
 * 
 * Variants:
 * - Flat (default): Passive information
 * - Elevated: Interactive, implies commitment
 * 
 * Rules:
 * - Cards never stack elevation
 * - Passive information is always flat
 * - Elevation implies commitment
 */

import React, { useState } from 'react';
import { View, ViewProps, StyleSheet, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { Colors, Borders, Spacing, PhysicalShift } from '../../design';
import { createPhysicalShiftTransform } from '../../design/styles';

export type CardVariant = 'flat' | 'elevated';

export interface CardProps extends ViewProps {
  variant?: CardVariant;
  onPress?: () => void;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  variant = 'flat',
  onPress,
  children,
  style,
  ...props
}) => {
  const [isPressed, setIsPressed] = useState(false); // Track press state for mechanical feel
  const cardStyle = [
    styles.card,
    style,
  ];

  // For elevated variant, use two-layer physical shift effect
  if (variant === 'elevated') {
    if (onPress) {
      // Interactive elevated card with press state
      return (
        <View style={styles.elevatedWrapper}>
          {/* Static shadow block (background layer) - solid ink block, no border */}
          <View style={styles.shadowBlock} />
          {/* Moving foreground (actual card) */}
          <TouchableOpacity
            activeOpacity={1} // Set to 1 so the shift does the work, not a fade
            onPressIn={() => setIsPressed(true)} // Shift "down" to cover shadow
            onPressOut={() => setIsPressed(false)} // Snap back "up"
            onPress={onPress}
            style={[cardStyle, createPhysicalShiftTransform(isPressed)]}
            {...(props as TouchableOpacityProps)}
          >
            {children}
          </TouchableOpacity>
        </View>
      );
    } else {
      // Non-interactive elevated card (no press state needed)
      return (
        <View style={styles.elevatedWrapper}>
          {/* Static shadow block (background layer) */}
          <View style={styles.shadowBlock} />
          {/* Moving foreground (actual card) */}
          <View
            style={[cardStyle, createPhysicalShiftTransform(false)]}
            {...props}
          >
            {children}
          </View>
        </View>
      );
    }
  }

  // Flat variant - no physical shift
  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={onPress}
        style={cardStyle}
        {...(props as TouchableOpacityProps)}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View style={cardStyle} {...props}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.canvas.background,
    borderRadius: Borders.radius.medium,
    borderWidth: Borders.width,
    borderColor: Colors.text.primary, // Primary charcoal for punchiness (not muted)
    padding: Spacing.md,
  },
  elevatedWrapper: {
    // Wrapper for two-layer physical shift effect
    marginBottom: PhysicalShift.offset.y,
    marginRight: PhysicalShift.offset.x,
  },
  shadowBlock: {
    // Static shadow block (background layer) - solid ink block, no border
    // Positioned at the offset to create the physical shift effect
    position: 'absolute',
    top: PhysicalShift.offset.y,
    left: PhysicalShift.offset.x,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.text.primary, // Pure charcoal shadow - solid ink block
    borderRadius: Borders.radius.medium,
    // No border - creates a solid "ink" block effect
  },
});


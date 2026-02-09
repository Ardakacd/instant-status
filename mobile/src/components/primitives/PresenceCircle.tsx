/**
 * Presence Circle Component
 * 
 * This is your signature.
 * 
 * Variants:
 * - Dot: Self presence indicator
 * - Ring: Availability boundary
 * - Progress: 6 / 24 circles (friend limit indicator)
 * 
 * Rules:
 * - Circles represent people, never actions
 * - No gradients
 * - No animations unless explicitly showing change
 * 
 * Appears in:
 * - Home
 * - Add Friend
 * - Limits
 * - Widgets
 * - Empty states
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Borders } from '../../design';

export type PresenceCircleVariant = 'dot' | 'ring' | 'progress';

export interface PresenceCircleProps {
  variant?: PresenceCircleVariant;
  color?: string;
  size?: number;
  filled?: number | boolean; // For progress variant: number (how many filled). For dot variant: boolean
  total?: number; // For progress variant
  style?: ViewStyle;
}

export const PresenceCircle: React.FC<PresenceCircleProps> = ({
  variant = 'dot',
  color = Colors.interaction.primary,
  size = 12,
  filled = true,
  total,
  style,
}) => {
  if (variant === 'progress' && total !== undefined) {
    // Progress variant: show filled/total circles
    // filled should be a number for progress variant
    const filledCount = typeof filled === 'number' ? filled : (filled ? total : 0);
    return (
      <View style={[styles.progressContainer, style]}>
        {Array.from({ length: total }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.progressCircle,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: index < filledCount ? color : Colors.interaction.disabled,
              },
            ]}
          />
        ))}
      </View>
    );
  }

  if (variant === 'ring') {
    // Ring variant: availability boundary
    return (
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: Borders.width,
            borderColor: color,
          },
          style,
        ]}
      />
    );
  }

  // Dot variant: self presence indicator
  // Keep border for both states to prevent size jitter when transitioning between filled/unfilled
  const isFilled = typeof filled === 'boolean' ? filled : filled > 0;
  return (
    <View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: Borders.width,
          borderColor: color,
          backgroundColor: isFilled ? color : 'transparent',
        },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  dot: {},
  ring: {
    backgroundColor: 'transparent',
  },
  progressContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap', // Wrap to multiple lines if needed (e.g., 24 circles)
    gap: 6, // Increased slightly for better "calm" spacing
    width: '100%', // Ensure container respects parent width constraints for wrapping
  },
  progressCircle: {},
});


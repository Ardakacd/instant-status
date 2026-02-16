/**
 * Info Box Component
 * 
 * Used for:
 * - Pending plan
 * - Explanation
 * - Gentle warnings
 * 
 * Style:
 * - Light mint tint background
 * - Flat
 * - No icon unless essential
 * - Never urgent
 */

import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { Borders, Spacing } from '../../design';
import { Text } from '../primitives/Text';

export interface InfoBoxProps extends ViewProps {
  children: React.ReactNode;
  icon?: React.ReactNode; // Only if essential
}

export const InfoBox: React.FC<InfoBoxProps> = ({
  children,
  icon,
  style,
  ...props
}) => {
  return (
    <View
      style={[styles.infoBox, style]}
      {...props}
    >
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      <View style={styles.content}>
        {typeof children === 'string' ? (
          <Text variant="primary">{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  infoBox: {
    backgroundColor: '#ECFDF5', // Light mint tint — matches primary palette
    borderRadius: Borders.radius.medium,
    padding: Spacing.md,
    flexDirection: 'row', // Horizontal alignment is more "Inline"
    alignItems: 'flex-start',
    gap: Spacing.sm, // Clean gap between icon and text
    // Flat, no elevation
  },
  iconContainer: {
    // No margin needed if using gap
  },
  content: {
    flex: 1, // Ensures text wraps correctly and doesn't push the icon off-screen
  },
});


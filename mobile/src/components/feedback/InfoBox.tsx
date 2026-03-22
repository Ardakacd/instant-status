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
import { Borders, Spacing } from '../../design/tokens';
import { useColors } from '../../design';
import { Text } from '../primitives/Text';

export interface InfoBoxProps extends ViewProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export const InfoBox: React.FC<InfoBoxProps> = ({
  children,
  icon,
  style,
  ...props
}) => {
  const colors = useColors();
  return (
    <View
      style={[styles.infoBox, { backgroundColor: colors.tint.mint }, style]}
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
    borderRadius: Borders.radius.medium,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  iconContainer: {},
  content: {
    flex: 1,
  },
});

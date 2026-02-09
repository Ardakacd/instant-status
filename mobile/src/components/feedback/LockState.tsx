/**
 * Lock State Component
 * 
 * Used when:
 * - Friend limit reached
 * - Premium-only option tapped
 * 
 * Rules:
 * - No modal
 * - No alert
 * - Button sinks
 * - Copy explains calmly
 * 
 * Emotion:
 * - "That's the boundary."
 */

import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { Colors, Borders, Spacing, Typography } from '../../design';
import { Text } from '../primitives/Text';
import { Button } from '../actions/Button';

export interface LockStateProps extends ViewProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: React.ReactNode;
}

export const LockState: React.FC<LockStateProps> = ({
  title,
  message,
  actionLabel,
  onAction,
  children,
  style,
  ...props
}) => {
  return (
    <View style={[styles.lockState, style]} {...props}>
      <View style={styles.content}>
        <Text variant="primary" style={styles.title}>
          {title}
        </Text>
        <Text variant="secondary" style={styles.message}>
          {message}
        </Text>
        {children}
      </View>
      {actionLabel && onAction && (
        <Button
          variant="primary"
          onPress={onAction}
          style={styles.actionButton}
          disabled
        >
          {actionLabel}
        </Button>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  lockState: {
    padding: Spacing.lg,
    alignItems: 'center', // Centering the lock state often feels more like a "stamp"
  },
  content: {
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  title: {
    fontFamily: Typography.fontFamily.semiBold, // Use the token!
    fontSize: 18,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    // Let the Text primitive handle the color and lineHeight
  },
  actionButton: {
    width: '100%', // Full width buttons feel more grounded in lock states
  },
});


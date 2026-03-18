/**
 * Empty State Component
 * 
 * Style: Large emoji, bold centered text, action-oriented.
 * 
 * Used for:
 * - No friends list
 * - No recent statuses
 * - Empty search results
 * 
 * Rules:
 * - Bold, not apologetic
 * - Large emoji for visual impact
 * - Centered content
 * - Optional action button
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography, useResponsive } from '../../design';
import { Text } from '../primitives/Text';
import { Section } from '../containers/Section';

export interface EmptyStateProps {
  emoji: string;
  title: string;
  message: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  emoji,
  title,
  message,
  action,
}) => {
  const { fs } = useResponsive();
  return (
    <Section 
      spacing="lg" 
      style={styles.container}
    >
      <Text style={[styles.emoji, { fontSize: fs(64) }]}>{emoji}</Text>
      <View style={styles.textContainer}>
        <Text variant="primary" style={[styles.title, { fontSize: fs(20) }]}>
          {title}
        </Text>
        <Text variant="secondary" style={[styles.message, { fontSize: fs(16) }]}>
          {message}
        </Text>
      </View>
      {action && <View style={styles.actionContainer}>{action}</View>}
    </Section>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    minHeight: 300, // Ensures it takes up space even when empty
  },
  emoji: {
    fontSize: 64,
    marginBottom: Spacing.md,
  },
  textContainer: {
    alignItems: 'center',
    maxWidth: 280, // Prevents text from being too wide on large screens
  },
  title: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.semiBold,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  message: {
    textAlign: 'center',
    fontSize: 16,
  },
  actionContainer: {
    marginTop: Spacing.lg,
    width: '100%',
    alignItems: 'center',
  },
});


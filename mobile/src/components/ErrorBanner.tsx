/**
 * Error Banner Component
 * 
 * Simple, minimal error message display
 * - No background box or borders
 * - Just text with an icon
 * - Clean and unobtrusive
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing } from '../design';
import { Text } from './primitives/Text';

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  dismissible?: boolean;
}

export function ErrorBanner({
  message,
}: ErrorBannerProps) {
  if (!message) return null;

  return (
    <View style={styles.container}>
      <Ionicons name="alert-circle" size={16} color={Colors.interaction.error} />
      <Text variant="hint" style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  message: {
    flex: 1,
    color: Colors.interaction.error, // Red for error messages
  },
});

/**
 * Error Banner Component
 * 
 * Logic:
 * - High visibility but grounded
 * - Matches the LockState/InputError color palette
 * - Physical presence via borders
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from "@expo/vector-icons";
import { Colors, Borders, Spacing, Typography } from '../design';
import { Text } from './primitives/Text';

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  dismissible?: boolean;
}

export function ErrorBanner({
  message,
  onDismiss,
  dismissible = true,
}: ErrorBannerProps) {
  if (!message) return null;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Charcoal icon on Yellow feels more "Caution" than "Emergency" */}
        <Ionicons name="warning" size={20} color={Colors.text.primary} />
        <View style={styles.textWrapper}>
          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
      
      {dismissible && onDismiss && (
        <TouchableOpacity onPress={onDismiss} style={styles.dismissButton}>
          <Ionicons name="close" size={20} color={Colors.text.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.interaction.accent, // Yellow/Accent for "Pay Attention"
    borderWidth: Borders.width,
    borderColor: Colors.text.primary,
    borderRadius: Borders.radius.medium,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  textWrapper: {
    flex: 1,
  },
  message: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 14,
    color: Colors.text.primary, // Charcoal text on Yellow is highly readable
    lineHeight: 18,
  },
  dismissButton: {
    padding: Spacing.xs,
    marginLeft: Spacing.sm,
  },
});

import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from "@expo/vector-icons";
import { Borders, Spacing, Typography } from '../design/tokens';
import { useColors } from '../design';
import { Text } from './primitives/Text';

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  const colors = useColors();
  if (!message) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.tint.error }]}>
      <Ionicons name="alert-circle" size={16} color={colors.interaction.error} />
      <Text style={[styles.message, { color: colors.interaction.error }]}>{message}</Text>
      {onDismiss && (
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={16} color={colors.interaction.error} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderRadius: Borders.radius.medium,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  message: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    lineHeight: 18,
  },
});

import React from "react";
import { View, StyleSheet } from "react-native";
import { Colors, Spacing, Typography, getContrastingTextColor } from "../design";
import { Card } from "./containers/Card";
import { Text } from "./primitives/Text";

interface StatusPreviewCardProps {
  emoji: string;
  label: string;
  color: string;
}

export default function StatusPreviewCard({
  emoji,
  label,
  color,
}: StatusPreviewCardProps) {
  const backgroundColor = color || Colors.interaction.primary;
  const textColor = getContrastingTextColor(backgroundColor);
  
  return (
    <View style={styles.container}>
      <Text variant="secondary" style={styles.previewLabel}>
        Preview
      </Text>
      
      {/* We use variant="elevated" so the preview looks like 
          a real physical object the user is "building" 
      */}
      <Card 
        variant="elevated" 
        style={{ backgroundColor }}
      >
        <View style={styles.previewContent}>
          <Text style={styles.previewEmoji}>{emoji || "🟢"}</Text>
          <Text style={[styles.previewText, { color: textColor }]}>
            {label || "Status Label"}
          </Text>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  previewLabel: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase', // Makes it look more like a "label"
  },
  previewContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center", // Center content for the preview
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  previewEmoji: {
    fontSize: 32,
  },
  previewText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 18,
    // Color is set dynamically via getContrastingTextColor for accessibility
  },
});

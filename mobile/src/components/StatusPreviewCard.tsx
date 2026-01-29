import React from "react";
import { View, Text, StyleSheet } from "react-native";

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
  return (
    <View style={styles.container}>
      <Text style={styles.previewLabel}>Preview</Text>
      <View
        style={[
          styles.previewCard,
          { backgroundColor: color || "#10B981" },
        ]}
      >
        <View style={styles.previewContent}>
          <Text style={styles.previewEmoji}>{emoji || "🟢"}</Text>
          <Text style={styles.previewText}>
            {label || "Status Label"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  previewLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  previewCard: {
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 80,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  previewContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  previewEmoji: {
    fontSize: 32,
  },
  previewText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});


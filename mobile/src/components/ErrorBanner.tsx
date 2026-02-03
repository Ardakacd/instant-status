import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

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
        <Ionicons name="alert-circle" size={20} color="#FFFFFF" />
        <Text style={styles.message}>{message}</Text>
      </View>
      {dismissible && onDismiss && (
        <TouchableOpacity onPress={onDismiss} style={styles.dismissButton}>
          <Ionicons name="close" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#EF4444",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  message: {
    color: "#FFFFFF",
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  dismissButton: {
    padding: 4,
    marginLeft: 8,
  },
});


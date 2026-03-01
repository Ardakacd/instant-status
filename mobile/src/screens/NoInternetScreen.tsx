import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { Colors, Spacing, SAFE_AREA_BOTTOM } from "../design";
import { Text } from "../components/primitives/Text";
import { Button } from "../components/actions/Button";

export default function NoInternetScreen() {
  const insets = useSafeAreaInsets();
  const { refreshUser } = useAuth();
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await refreshUser();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: SAFE_AREA_BOTTOM + insets.bottom }]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons
            name="cloud-offline-outline"
            size={64}
            color={Colors.text.secondary}
          />
        </View>
        <Text variant="primary" style={styles.title}>
          No Internet Connection
        </Text>
        <Text variant="secondary" style={styles.message}>
          Please check your connection and try again.
        </Text>
        <Button
          variant="primary"
          onPress={handleRetry}
          loading={retrying}
          disabled={retrying}
          style={styles.button}
        >
          Try Again
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas.background,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  content: {
    alignItems: "center",
    maxWidth: 320,
  },
  iconContainer: {
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  message: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  button: {
    minWidth: 200,
  },
});

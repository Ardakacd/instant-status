import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { Colors, Spacing, Typography, SAFE_AREA_BOTTOM, useResponsive } from "../design";
import { Text } from "../components/primitives/Text";
import { Button } from "../components/actions/Button";

export default function NoInternetScreen() {
  const insets = useSafeAreaInsets();
  const { fs } = useResponsive();
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
        <View style={styles.iconCircle}>
          <Ionicons name="cloud-offline-outline" size={fs(32)} color={Colors.text.secondary} />
        </View>
        <Text variant="primary" style={[styles.title, { fontSize: fs(22) }]}>
          No Internet Connection
        </Text>
        <Text variant="secondary" style={[styles.message, { fontSize: fs(16) }]}>
          Please check your connection and try again.
        </Text>
        <Button
          variant="primary"
          onPress={handleRetry}
          loading={retrying}
          disabled={retrying}
          fullWidth
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
    width: "100%",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: Typography.fontFamily.semiBold,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  message: {
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
});

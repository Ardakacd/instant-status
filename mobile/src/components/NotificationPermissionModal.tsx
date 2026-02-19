import React, { useState } from "react";
import {
  View,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Borders, Spacing, Typography } from "../design";
import { Text } from "./primitives/Text";
import { Button } from "./actions/Button";

interface NotificationPermissionModalProps {
  visible: boolean;
  onEnable: () => Promise<void>;
  onNotNow: () => void;
}

export function NotificationPermissionModal({
  visible,
  onEnable,
  onNotNow,
}: NotificationPermissionModalProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);

  const handleEnable = async () => {
    setLoading(true);
    try {
      await onEnable();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onNotNow}
    >
      <View style={[styles.overlay, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons
              name="notifications-outline"
              size={48}
              color={Colors.interaction.primary}
            />
          </View>

          <Text variant="primary" style={styles.title}>
            Keep Your Status Widget Updated
          </Text>

          <Text variant="secondary" style={styles.body}>
            Instant Status uses notifications to refresh your home screen widget
            in real-time. Without them, your widget may not update properly.
          </Text>

          <View style={styles.bullets}>
            <View style={styles.bulletRow}>
              <Ionicons
                name="sync-outline"
                size={18}
                color={Colors.interaction.primary}
                style={styles.bulletIcon}
              />
              <Text variant="secondary" style={styles.bulletText}>
                Real-time widget updates
              </Text>
            </View>
            <View style={styles.bulletRow}>
              <Ionicons
                name="phone-portrait-outline"
                size={18}
                color={Colors.interaction.primary}
                style={styles.bulletIcon}
              />
              <Text variant="secondary" style={styles.bulletText}>
                Live status sync
              </Text>
            </View>
            <View style={styles.bulletRow}>
              <Ionicons
                name="flash-outline"
                size={18}
                color={Colors.interaction.primary}
                style={styles.bulletIcon}
              />
              <Text variant="secondary" style={styles.bulletText}>
                Faster refresh
              </Text>
            </View>
          </View>

          <Button
            variant="primary"
            onPress={handleEnable}
            loading={loading}
            disabled={loading}
            fullWidth
            style={styles.enableButton}
          >
            Enable Notifications
          </Button>

          <TouchableOpacity
            onPress={onNotNow}
            disabled={loading}
            style={styles.notNowButton}
            activeOpacity={0.7}
          >
            <Text variant="secondary" style={styles.notNowText}>
              Not Now
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
    paddingHorizontal: Spacing.lg,
  },
  content: {
    backgroundColor: Colors.canvas.background,
    borderRadius: Borders.radius.large,
    padding: Spacing.xl,
    ...(Platform.OS === "ios" && {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
    }),
  },
  iconContainer: {
    alignSelf: "center",
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.semiBold,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  bullets: {
    marginBottom: Spacing.xl,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  bulletIcon: {
    marginRight: Spacing.sm,
  },
  bulletText: {
    fontSize: 15,
  },
  enableButton: {
    marginBottom: Spacing.sm,
  },
  notNowButton: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  notNowText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.medium,
  },
});

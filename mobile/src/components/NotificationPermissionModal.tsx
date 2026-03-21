import React, { useState } from "react";
import {
  View,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Borders, Spacing, Typography, SAFE_AREA_BOTTOM, useResponsive } from "../design";
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
  const { fs } = useResponsive();
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
      <View style={[styles.overlay, { paddingBottom: SAFE_AREA_BOTTOM + insets.bottom }]}>
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons
              name="notifications-outline"
              size={fs(30)}
              color="#FFFFFF"
            />
          </View>

          <Text variant="primary" style={[styles.title, { fontSize: fs(20) }]}>
            Keep Your Status Widget Updated
          </Text>

          <Text variant="secondary" style={[styles.body, { fontSize: fs(15), lineHeight: fs(22) }]}>
            Instant Status uses notifications to refresh your home screen widget
            in real-time. Without them, your widget may not update properly.
          </Text>

          <View style={styles.bullets}>
            <View style={styles.bulletRow}>
              <View style={styles.bulletIconCircle}>
                <Ionicons name="sync-outline" size={16} color={Colors.interaction.primary} />
              </View>
              <Text variant="secondary" style={[styles.bulletText, { fontSize: fs(15) }]}>
                Real-time widget updates
              </Text>
            </View>
            <View style={styles.bulletRow}>
              <View style={styles.bulletIconCircle}>
                <Ionicons name="phone-portrait-outline" size={16} color={Colors.interaction.primary} />
              </View>
              <Text variant="secondary" style={[styles.bulletText, { fontSize: fs(15) }]}>
                Live status sync
              </Text>
            </View>
            <View style={styles.bulletRow}>
              <View style={styles.bulletIconCircle}>
                <Ionicons name="flash-outline" size={16} color={Colors.interaction.primary} />
              </View>
              <Text variant="secondary" style={[styles.bulletText, { fontSize: fs(15) }]}>
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
            <Text variant="secondary" style={[styles.notNowText, { fontSize: fs(16) }]}>
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.interaction.primary,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
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
  bulletIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  bulletText: {
    fontSize: 15,
    flex: 1,
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

import React, { useState, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Connection } from "../types";
import { connectionsService } from "../services/connections.service";
import Toast from "react-native-toast-message";
import { Colors, Borders, Spacing, Typography } from "../design";
import { Text } from "../components/primitives/Text";
import { Button } from "../components/actions/Button";
import { InlineAction } from "../components/actions/InlineAction";

export default function FriendsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [manageMenuVisible, setManageMenuVisible] = useState(false);
  const [selectedConnection, setSelectedConnection] =
    useState<Connection | null>(null);

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    setRefreshing(true);
    try {
      const conns = await connectionsService.getConnections();
      setConnections(conns);
    } catch (error) {
      console.error("Error loading connections:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const openManageMenu = (connection: Connection) => {
    setSelectedConnection(connection);
    setManageMenuVisible(true);
  };

  const closeManageMenu = () => {
    setManageMenuVisible(false);
    setSelectedConnection(null);
  };

  const handleRemoveFriend = async () => {
    if (!selectedConnection) return;

    const friendName = getDisplayName(
      selectedConnection.friend_first_name,
      selectedConnection.friend_last_name,
    );

    closeManageMenu();

    Alert.alert(
      "Remove Friend",
      `Are you sure you want to remove ${friendName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await connectionsService.deleteConnection(
                selectedConnection.friend_id,
              );
              await loadConnections();
              Toast.show({
                type: "success",
                text1: `${friendName} has been removed from your friends list.`,
              });
            } catch (error: any) {
              Toast.show({
                type: "error",
                text1: error.message || "Check your connection and try again.",
              });
            }
          },
        },
      ],
    );
  };

  const handleToggleVisibility = async () => {
    if (!selectedConnection) return;

    // Toggle this user's visibility setting
    const newUserShowsStatus = !selectedConnection.user_shows_status;

    try {
      await connectionsService.updateVisibility(
        selectedConnection.friend_id,
        newUserShowsStatus,
      );

      // Update local state
      // Note: visibility (combined) will be recalculated on next fetch
      setConnections((prev) =>
        prev.map((conn) =>
          conn.id === selectedConnection.id
            ? {
                ...conn,
                user_shows_status: newUserShowsStatus,
                // Update combined visibility: both must be true
                visibility: newUserShowsStatus && (conn.visibility || false),
              }
            : conn,
        ),
      );

      closeManageMenu();

      Toast.show({
        type: "success",
        text1: newUserShowsStatus
          ? "You've enabled status sharing. They can now see your status."
          : "You've hidden your status. They can't see your status until you enable it again.",
      });
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1:
          error.message ||
          "Failed to update visibility. Check your connection and try again.",
      });
    }
  };

  const getInitials = (firstName: string | null, lastName: string | null) => {
    if (firstName && lastName) {
      return (firstName[0] + lastName[0]).toUpperCase();
    }
    if (firstName) {
      return firstName[0].toUpperCase();
    }
    if (lastName) {
      return lastName[0].toUpperCase();
    }
    return "?";
  };

  const getDisplayName = (
    firstName: string | null,
    lastName: string | null,
  ) => {
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    }
    return firstName || lastName || "Unknown";
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { flexGrow: 1, paddingTop: insets.top + Spacing.md },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={loadConnections}
            tintColor={Colors.interaction.primary}
            colors={[Colors.interaction.primary]}
            progressViewOffset={60}
          />
        }
      >
        {/* Friends Section */}
        <View style={styles.friendsSection}>
          <View style={styles.sectionHeader}>
            <Text variant="primary" style={styles.sectionTitle}>
              My Friends
            </Text>
            <View style={styles.headerRight}>
              <View style={styles.friendCount}>
                <Ionicons
                  name="people-outline"
                  size={14}
                  color={Colors.text.secondary}
                  style={styles.friendCountIcon}
                />
                <Text style={styles.friendCountText}>{connections.length}</Text>
              </View>
              <TouchableOpacity
                style={styles.connectButton}
                onPress={() => navigation.navigate("Connect" as never)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="person-add"
                  size={16}
                  color={Colors.interaction.primary}
                />
                <Text style={styles.connectButtonText}>Connect</Text>
              </TouchableOpacity>
            </View>
          </View>

          {refreshing ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator
                size="small"
                color={Colors.interaction.primary}
              />
            </View>
          ) : connections.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <Text style={styles.emptyIcon}>👥</Text>
              </View>
              <Text variant="primary" style={styles.emptyTitle}>
                No friends yet
              </Text>
              <Text variant="secondary" style={styles.emptyText}>
                Connect with friends to see them here
              </Text>
              <Button
                variant="primary"
                onPress={() => navigation.navigate("Connect" as never)}
                style={styles.emptyConnectButton}
              >
                Connect
              </Button>
            </View>
          ) : (
            <View style={styles.friendsList}>
              {connections.map((conn) => {
                const displayName = getDisplayName(
                  conn.friend_first_name,
                  conn.friend_last_name,
                );
                const initials = getInitials(
                  conn.friend_first_name,
                  conn.friend_last_name,
                );
                return (
                  <TouchableOpacity
                    key={conn.id}
                    onPress={() => openManageMenu(conn)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.friendCard}>
                      <View style={styles.avatar}>
                        {conn.friend_avatar_url ? (
                          <Text variant="primary" style={styles.avatarText}>
                            IMG
                          </Text>
                        ) : (
                          <Text variant="primary" style={styles.avatarText}>
                            {initials}
                          </Text>
                        )}
                      </View>
                      <View style={styles.friendInfo}>
                        <Text
                          variant="primary"
                          style={styles.friendName}
                          numberOfLines={1}
                        >
                          {displayName}
                        </Text>
                        <View style={styles.friendStatusRow}>
                          <View
                            style={[
                              styles.statusDot,
                              { backgroundColor: Colors.interaction.primary },
                            ]}
                          />
                          <Text
                            variant="secondary"
                            style={styles.friendStatus}
                            numberOfLines={1}
                          >
                            Connected
                          </Text>
                        </View>
                        {!conn.user_shows_status && (
                          <Text variant="hint" style={styles.hiddenStatusText}>
                            You've hidden your status from them
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity
                        style={styles.manageButton}
                        onPress={() => openManageMenu(conn)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons
                          name="ellipsis-horizontal"
                          size={20}
                          color={Colors.text.secondary}
                        />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Manage Menu Modal */}
      <Modal
        visible={manageMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeManageMenu}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={closeManageMenu}
        >
          <View
            style={styles.manageMenu}
            onStartShouldSetResponder={() => true}
          >
            {selectedConnection && (
              <>
                <View style={styles.manageMenuHeader}>
                  <Text variant="primary" style={styles.manageMenuTitle}>
                    {getDisplayName(
                      selectedConnection.friend_first_name,
                      selectedConnection.friend_last_name,
                    )}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.manageMenuItem}
                  onPress={handleToggleVisibility}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={
                      selectedConnection.user_shows_status
                        ? "eye-off-outline"
                        : "eye-outline"
                    }
                    size={22}
                    color={Colors.text.primary}
                  />
                  <View style={styles.manageMenuItemContent}>
                    <Text variant="primary" style={styles.manageMenuItemText}>
                      {selectedConnection.user_shows_status
                        ? "Hide my status"
                        : "Show my status"}
                    </Text>
                    <Text
                      variant="secondary"
                      style={styles.manageMenuItemSubtext}
                    >
                      {selectedConnection.user_shows_status
                        ? "You'll hide your status from them. They won't see your status until you enable it again."
                        : "You'll enable status sharing. They can see your status when you enable it."}
                    </Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.manageMenuDivider} />

                <TouchableOpacity
                  style={[styles.manageMenuItem, styles.manageMenuItemDanger]}
                  onPress={handleRemoveFriend}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="trash-outline"
                    size={22}
                    color={Colors.interaction.error}
                  />
                  <View style={styles.manageMenuItemContent}>
                    <Text
                      variant="primary"
                      style={styles.manageMenuItemTextDanger}
                    >
                      Remove friend
                    </Text>
                    <Text
                      variant="secondary"
                      style={styles.manageMenuItemSubtext}
                    >
                      Permanently remove this connection
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.manageMenuCancel}
                  onPress={closeManageMenu}
                  activeOpacity={0.7}
                >
                  <InlineAction fontSize={16}>Cancel</InlineAction>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.lg,
  },
  friendsSection: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.semiBold,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  friendCount: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Borders.radius.medium,
    minWidth: 44,
    justifyContent: "center",
  },
  friendCountIcon: {
    marginRight: Spacing.xs,
  },
  friendCountText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 14,
    color: Colors.text.primary,
  },
  connectButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  connectButtonText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.interaction.primary,
  },
  loadingContainer: {
    padding: Spacing.xxl,
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingTop: Spacing.xxl + Spacing.lg,
    paddingBottom: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
  },
  emptyIconContainer: {
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  emptyIcon: {
    fontSize: 52,
    lineHeight: 64,
    includeFontPadding: false,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.semiBold,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
  },
  emptyConnectButton: {
    marginTop: Spacing.lg,
  },
  friendsList: {
    gap: Spacing.md,
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
    backgroundColor: Colors.interaction.primary + "15",
  },
  avatarText: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.semiBold,
  },
  friendInfo: {
    flex: 1,
    minWidth: 0,
  },
  friendName: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.medium,
    marginBottom: Spacing.xs,
  },
  friendStatusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: Spacing.xs,
  },
  friendStatus: {
    fontSize: 14,
    flex: 1,
  },
  hiddenStatusText: {
    marginTop: Spacing.xs,
  },
  manageButton: {
    padding: Spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  manageMenu: {
    backgroundColor: Colors.canvas.background,
    borderTopLeftRadius: Borders.radius.large,
    borderTopRightRadius: Borders.radius.large,
    paddingBottom: Spacing.xxl,
    paddingTop: Spacing.lg,
  },
  manageMenuHeader: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.text.secondary + "40",
  },
  manageMenuTitle: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.semiBold,
  },
  manageMenuItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  manageMenuItemDanger: {},
  manageMenuItemContent: {
    flex: 1,
  },
  manageMenuItemText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.medium,
    marginBottom: Spacing.xs,
  },
  manageMenuItemTextDanger: {
    color: Colors.interaction.error,
  },
  manageMenuItemSubtext: {
    fontSize: 14,
    lineHeight: 20,
  },
  manageMenuDivider: {
    height: 1,
    backgroundColor: Colors.text.secondary,
    opacity: 0.3,
    marginVertical: Spacing.sm,
  },
  manageMenuCancel: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
});

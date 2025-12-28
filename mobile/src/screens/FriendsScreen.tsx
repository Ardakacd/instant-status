import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Connection } from "../types";
import { connectionsService } from "../services/connections.service";

export default function FriendsScreen() {
  const navigation = useNavigation();
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
      selectedConnection.friend_last_name
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
                selectedConnection.friend_id
              );
              await loadConnections();
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to remove friend");
            }
          },
        },
      ]
    );
  };

  const handleToggleVisibility = async () => {
    if (!selectedConnection) return;

    // Toggle this user's visibility setting
    const newUserShowsStatus = !selectedConnection.user_shows_status;

    try {
      await connectionsService.updateVisibility(
        selectedConnection.friend_id,
        newUserShowsStatus
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
            : conn
        )
      );

      closeManageMenu();

      Alert.alert(
        "Success",
        newUserShowsStatus
          ? "You've enabled status sharing. They can now see your status."
          : "You've hidden your status. They can't see your status until you enable it again."
      );
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to update visibility");
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
    lastName: string | null
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
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={loadConnections}
            tintColor="#007AFF"
            colors={["#007AFF"]}
            progressViewOffset={60}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Friends</Text>
        </View>

        {/* Friends Section */}
        <View style={styles.friendsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Friends</Text>
            <View style={styles.headerRight}>
              <Text style={styles.friendCount}>{connections.length}</Text>
              <TouchableOpacity
                style={styles.connectButton}
                onPress={() => navigation.navigate("Connect" as never)}
              >
                <Ionicons name="person-add" size={16} color="#007AFF" />
                <Text style={styles.connectButtonText}>Connect</Text>
              </TouchableOpacity>
            </View>
          </View>

          {refreshing ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#007AFF" />
            </View>
          ) : connections.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyTitle}>No friends yet</Text>
              <Text style={styles.emptyText}>
                Connect with friends to see them here
              </Text>
            </View>
          ) : (
            <View style={styles.friendsList}>
              {connections.map((conn) => {
                const displayName = getDisplayName(
                  conn.friend_first_name,
                  conn.friend_last_name
                );
                const initials = getInitials(
                  conn.friend_first_name,
                  conn.friend_last_name
                );
                return (
                  <View key={conn.id} style={styles.friendCard}>
                    <View
                      style={[styles.avatar, { backgroundColor: "#EFF6FF" }]}
                    >
                      {conn.friend_avatar_url ? (
                        <Text style={styles.avatarText}>IMG</Text>
                      ) : (
                        <Text style={styles.avatarText}>{initials}</Text>
                      )}
                    </View>
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName} numberOfLines={1}>
                        {displayName}
                      </Text>
                      <View style={styles.friendStatusRow}>
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: "#10B981" },
                          ]}
                        />
                        <Text style={styles.friendStatus} numberOfLines={1}>
                          Connected
                        </Text>
                      </View>
                      {!conn.user_shows_status && (
                        <Text style={styles.hiddenStatusText}>
                          You've hidden your status from them
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.manageButton}
                      onPress={() => openManageMenu(conn)}
                    >
                      <Ionicons
                        name="ellipsis-horizontal"
                        size={20}
                        color="#6B7280"
                      />
                    </TouchableOpacity>
                  </View>
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
          <View style={styles.manageMenu}>
            {selectedConnection && (
              <>
                <View style={styles.manageMenuHeader}>
                  <Text style={styles.manageMenuTitle}>
                    {getDisplayName(
                      selectedConnection.friend_first_name,
                      selectedConnection.friend_last_name
                    )}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.manageMenuItem}
                  onPress={handleToggleVisibility}
                >
                  <Ionicons
                    name={
                      selectedConnection.user_shows_status
                        ? "eye-off-outline"
                        : "eye-outline"
                    }
                    size={22}
                    color="#111827"
                  />
                  <View style={styles.manageMenuItemContent}>
                    <Text style={styles.manageMenuItemText}>
                      {selectedConnection.user_shows_status
                        ? "Hide my status"
                        : "Show my status"}
                    </Text>
                    <Text style={styles.manageMenuItemSubtext}>
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
                >
                  <Ionicons name="trash-outline" size={22} color="#EF4444" />
                  <View style={styles.manageMenuItemContent}>
                    <Text
                      style={[
                        styles.manageMenuItemText,
                        styles.manageMenuItemTextDanger,
                      ]}
                    >
                      Remove friend
                    </Text>
                    <Text style={styles.manageMenuItemSubtext}>
                      Permanently remove this connection
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.manageMenuCancel}
                  onPress={closeManageMenu}
                >
                  <Text style={styles.manageMenuCancelText}>Cancel</Text>
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
    backgroundColor: "#F9FAFB",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 24,
    backgroundColor: "#FFFFFF",
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
    color: "#111827",
  },
  friendsSection: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  friendCount: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  connectButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  connectButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#007AFF",
  },
  loadingContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  friendsList: {
    gap: 12,
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    position: "relative",
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 6,
  },
  friendStatusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  friendStatus: {
    fontSize: 14,
    color: "#6B7280",
    flex: 1,
  },
  hiddenStatusText: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
    fontStyle: "italic",
  },
  manageButton: {
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  manageMenu: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    paddingTop: 20,
  },
  manageMenuHeader: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  manageMenuTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  manageMenuItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 12,
  },
  manageMenuItemDanger: {
    // Keep same style but will use danger color for text
  },
  manageMenuItemContent: {
    flex: 1,
  },
  manageMenuItemText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 4,
  },
  manageMenuItemTextDanger: {
    color: "#EF4444",
  },
  manageMenuItemSubtext: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
  },
  manageMenuDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 8,
  },
  manageMenuCancel: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    alignItems: "center",
  },
  manageMenuCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
  },
});

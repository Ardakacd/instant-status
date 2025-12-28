import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TouchableWithoutFeedback,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { StatusState, Status } from "../types";
import { statusService } from "../services/status.service";
import { useAuth } from "../contexts/AuthContext";
import StatusChangeModal from "../components/StatusChangeModal";
import { fetchSignInMethodsForEmail } from "firebase/auth";
import { auth } from "../config/firebase";

const STATUS_COLORS = {
  [StatusState.FREE]: "#10B981",
  [StatusState.BUSY]: "#F59E0B",
  [StatusState.DND]: "#EF4444",
  [StatusState.SLEEP]: "#8B5CF6",
  [StatusState.OFFLINE]: "#6B7280",
};

const STATUS_LABELS = {
  [StatusState.FREE]: "Free",
  [StatusState.BUSY]: "Busy",
  [StatusState.DND]: "Do Not Disturb",
  [StatusState.SLEEP]: "Sleep",
  [StatusState.OFFLINE]: "Offline",
};

const STATUS_ICONS = {
  [StatusState.FREE]: "✓",
  [StatusState.BUSY]: "!",
  [StatusState.DND]: "🚫",
  [StatusState.SLEEP]: "😴",
  [StatusState.OFFLINE]: "○",
};

export default function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [myStatus, setMyStatus] = useState<Status | null>(null);
  const [friendsStatus, setFriendsStatus] = useState<Status[]>([]);

  const currentStatus = myStatus?.state || StatusState.OFFLINE;
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<StatusState | null>(
    null
  );
  const [friendModalVisible, setFriendModalVisible] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<Status | null>(null);

  useEffect(() => {
    loadFriendsStatus();
    loadCurrentStatus();
    loadSignMethods();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadFriendsStatus(), loadCurrentStatus()]);
    } finally {
      setRefreshing(false);
    }
  };

  const loadSignMethods = async () => {
    try {
      await fetchSignInMethodsForEmail(auth, "kabadayi_arda@hotmail.com");
    } catch (error) {
      console.error("Error loading sign methods:", error);
    }
  };
  const loadCurrentStatus = async () => {
    try {
      const status = await statusService.getMyStatus();
      setMyStatus(status);
    } catch (error) {
      console.error("Error loading current status:", error);
    }
  };

  const loadFriendsStatus = async () => {
    try {
      const statuses = await statusService.getFriendsStatus();
      setFriendsStatus(statuses);
    } catch (error) {
      console.error("Error loading friends status:", error);
    }
  };

  const handleStatusButtonPress = (state: StatusState) => {
    setSelectedStatus(state);
    setModalVisible(true);
  };

  const handleStatusConfirm = async (
    state: StatusState,
    note?: string,
    expiresAt?: Date
  ) => {
    setLoading(true);
    try {
      const updatedStatus = await statusService.updateStatus(
        state,
        note,
        expiresAt
      );
      setMyStatus(updatedStatus);
      setModalVisible(false);
      setSelectedStatus(null);
    } catch (error) {
      console.error("Error updating status:", error);
    } finally {
      setLoading(false);
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
    return firstName || lastName || "User";
  };

  const formatExpirationTime = (expiresAt: string | null): string | null => {
    if (!expiresAt) return null;
    try {
      const expirationDate = new Date(expiresAt);
      const now = new Date();

      // Check if expired
      if (expirationDate <= now) return null;

      // Format as "Until 6:00 PM" or "Until Dec 21, 6:00 PM" if different day
      const isToday =
        expirationDate.getDate() === now.getDate() &&
        expirationDate.getMonth() === now.getMonth() &&
        expirationDate.getFullYear() === now.getFullYear();

      if (isToday) {
        // Use Intl.DateTimeFormat for automatic locale detection
        const timeFormatter = new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "2-digit",
        });
        return `Until ${timeFormatter.format(expirationDate)}`;
      } else {
        // Use Intl.DateTimeFormat for automatic locale detection
        const dateFormatter = new Intl.DateTimeFormat(undefined, {
          month: "short",
          day: "numeric",
        });
        const timeFormatter = new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "2-digit",
        });
        return `Until ${dateFormatter.format(
          expirationDate
        )} ${timeFormatter.format(expirationDate)}`;
      }
    } catch (error) {
      return null;
    }
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
            onRefresh={handleRefresh}
            tintColor="#007AFF"
            colors={["#007AFF"]}
            progressViewOffset={60}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.greeting}>Hello, </Text>
            <Text style={styles.userName}>{user?.first_name || "User"}</Text>
          </View>
        </View>

        {/* My Status Card */}
        <View style={styles.statusCard}>
          <Text style={styles.cardTitle}>Your Status</Text>
          <View style={styles.statusButtonsContainer}>
            {Object.values(StatusState).map((state) => {
              const isActive = currentStatus === state;
              return (
                <TouchableOpacity
                  key={state}
                  style={[
                    styles.statusButton,
                    isActive && styles.statusButtonActive,
                    isActive && { backgroundColor: STATUS_COLORS[state] },
                  ]}
                  onPress={() => handleStatusButtonPress(state)}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <Text style={styles.statusIcon}>{STATUS_ICONS[state]}</Text>
                  <Text
                    style={[
                      styles.statusButtonText,
                      isActive && styles.statusButtonTextActive,
                    ]}
                  >
                    {STATUS_LABELS[state]}
                  </Text>
                  {isActive && <View style={styles.activeIndicator} />}
                </TouchableOpacity>
              );
            })}
          </View>
          {myStatus && myStatus.expires_at && (
            <Text style={styles.expirationText}>
              {formatExpirationTime(myStatus.expires_at)}
            </Text>
          )}
        </View>

        {/* Friends Section */}
        <View style={styles.friendsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Friends</Text>
            <View style={styles.headerRight}>
              <Text style={styles.friendCount}>{friendsStatus.length}</Text>
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
          ) : friendsStatus.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyTitle}>No friends yet</Text>
              <Text style={styles.emptyText}>
                Add friends to see their status
              </Text>
            </View>
          ) : (
            <View style={styles.friendsList}>
              {friendsStatus.map((status) => {
                const displayName = getDisplayName(
                  status.first_name,
                  status.last_name
                );
                const initials = getInitials(
                  status.first_name,
                  status.last_name
                );
                return (
                  <TouchableOpacity
                    key={status.user_id}
                    style={styles.friendCard}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedFriend(status);
                      setFriendModalVisible(true);
                    }}
                  >
                    <View
                      style={[
                        styles.avatar,
                        { backgroundColor: STATUS_COLORS[status.state] + "20" },
                      ]}
                    >
                      {status.avatar_url ? (
                        <Text style={styles.avatarText}>IMG</Text>
                      ) : (
                        <Text style={styles.avatarText}>{initials}</Text>
                      )}
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: STATUS_COLORS[status.state] },
                        ]}
                      />
                    </View>
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName} numberOfLines={1}>
                        {displayName}
                      </Text>
                      <View style={styles.friendStatusRow}>
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: STATUS_COLORS[status.state] },
                          ]}
                        />
                        <View style={styles.friendStatusContent}>
                          <Text style={styles.friendStatus} numberOfLines={1}>
                            {STATUS_LABELS[status.state]}
                            {status.note && ` • ${status.note}`}
                          </Text>
                          {status.expires_at && (
                            <Text style={styles.friendExpirationText}>
                              {formatExpirationTime(status.expires_at)}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Status Change Modal */}
      {selectedStatus && (
        <StatusChangeModal
          visible={modalVisible}
          selectedStatus={selectedStatus}
          onClose={() => {
            setModalVisible(false);
            setSelectedStatus(null);
          }}
          onConfirm={handleStatusConfirm}
          loading={loading}
        />
      )}

      {/* Friend Status Detail Modal */}
      <Modal
        visible={friendModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setFriendModalVisible(false);
          setSelectedFriend(null);
        }}
      >
        <TouchableWithoutFeedback
          onPress={() => {
            setFriendModalVisible(false);
            setSelectedFriend(null);
          }}
        >
          <View style={styles.friendModalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.friendModalContent}>
                {selectedFriend && (
                  <>
                    {/* Header */}
                    <View style={styles.friendModalHeader}>
                      <Text style={styles.friendModalTitle}>
                        {getDisplayName(
                          selectedFriend.first_name,
                          selectedFriend.last_name
                        )}
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          setFriendModalVisible(false);
                          setSelectedFriend(null);
                        }}
                        style={styles.friendModalCloseButton}
                      >
                        <Ionicons name="close" size={24} color="#6B7280" />
                      </TouchableOpacity>
                    </View>

                    {/* Status */}
                    <View style={styles.friendModalSection}>
                      <Text style={styles.friendModalLabel}>Status</Text>
                      <View style={styles.friendModalStatusRow}>
                        <View
                          style={[
                            styles.friendModalStatusDot,
                            {
                              backgroundColor:
                                STATUS_COLORS[selectedFriend.state],
                            },
                          ]}
                        />
                        <Text style={styles.friendModalStatusText}>
                          {STATUS_LABELS[selectedFriend.state]}
                        </Text>
                      </View>
                    </View>

                    {/* Note */}
                    {selectedFriend.note && (
                      <View style={styles.friendModalSection}>
                        <Text style={styles.friendModalLabel}>Note</Text>
                        <Text style={styles.friendModalNote}>
                          {selectedFriend.note}
                        </Text>
                      </View>
                    )}

                    {/* Expires At */}
                    {selectedFriend.expires_at && (
                      <View style={styles.friendModalSection}>
                        <Text style={styles.friendModalLabel}>Expires At</Text>
                        <Text style={styles.friendModalExpiration}>
                          {formatExpirationTime(selectedFriend.expires_at)}
                        </Text>
                      </View>
                    )}

                    {/* Close Button */}
                    <TouchableOpacity
                      style={styles.friendModalButton}
                      onPress={() => {
                        setFriendModalVisible(false);
                        setSelectedFriend(null);
                      }}
                    >
                      <Text style={styles.friendModalButtonText}>Close</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
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
  headerContent: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
  },
  greeting: {
    fontSize: 16,
    color: "#6B7280",
  },
  userName: {
    fontSize: 32,
    fontWeight: "700",
    color: "#111827",
  },
  statusCard: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    paddingBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
  statusButtonsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  statusButton: {
    width: "31%",
    marginBottom: 12,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
    position: "relative",
    minHeight: 100,
  },
  statusButtonActive: {
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statusIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  statusButtonText: {
    color: "#374151",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  statusButtonTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  activeIndicator: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
  },
  friendsSection: {
    marginTop: 24,
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
    paddingTop: 20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
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
  statusBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: "#FFFFFF",
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
  friendStatusContent: {
    flex: 1,
  },
  friendStatus: {
    fontSize: 14,
    color: "#6B7280",
  },
  friendExpirationText: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
  },
  expirationText: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 12,
    textAlign: "center",
    fontStyle: "italic",
  },
  friendModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  friendModalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  friendModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  friendModalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  friendModalCloseButton: {
    padding: 4,
  },
  friendModalSection: {
    marginBottom: 20,
  },
  friendModalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  friendModalStatusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  friendModalStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  friendModalStatusText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  friendModalNote: {
    fontSize: 16,
    color: "#374151",
    lineHeight: 24,
  },
  friendModalExpiration: {
    fontSize: 16,
    color: "#6B7280",
    fontStyle: "italic",
  },
  friendModalButton: {
    backgroundColor: "#007AFF",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  friendModalButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

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
  Animated,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Status, StatusOption } from "../types";
import { statusService } from "../services/status.service";
import { statusOptionService } from "../services/status-option.service";
import { widgetStorageService } from "../services/widget-storage.service";
import { useAuth } from "../contexts/AuthContext";
import StatusChangeModal from "../components/StatusChangeModal";
import { fetchSignInMethodsForEmail } from "firebase/auth";
import { auth } from "../config/firebase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Toast from "react-native-toast-message";
import { useIsPremium } from "../hooks/useIsPremium";
import { presentPaywall } from "../services/purchases.service";

export default function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const { isPremium, loading: premiumLoading } = useIsPremium();
  const [myStatus, setMyStatus] = useState<Status | null>(null);
  const [friendsStatus, setFriendsStatus] = useState<Status[]>([]);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedOption, setSelectedOption] = useState<StatusOption | null>(
    null
  );
  const [friendModalVisible, setFriendModalVisible] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<Status | null>(null);
  const [showRefreshHint, setShowRefreshHint] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(-100)).current;
  const pendingFriendIdRef = React.useRef<string | null>(null);

  const currentOptionId = myStatus?.option?.id || null;

  const handleManageStatusPress = async () => {
    // If premium, navigate to Manage Status screen
    if (isPremium) {
      navigation.navigate("ManageStatus" as never);
      return;
    }

    // If not premium, show paywall
    try {
      const success = await presentPaywall();
      if (success) {
        // User purchased/restored - they can now access Manage Status
        // The useIsPremium hook will automatically update, so we can navigate
        navigation.navigate("ManageStatus" as never);
      }
    } catch (error: any) {
      console.error("Error opening paywall:", error);
      Toast.show({
        type: "error",
        text1: error.message || "Failed to open subscription options. Please try again.",
      });
    }
  };

  useEffect(() => {
    loadStatusOptions();
    loadFriendsStatus();
    loadCurrentStatus();
    loadSignMethods();
    checkRefreshHint();
  }, []);

  const loadStatusOptions = async () => {
    try {
      const options = await statusOptionService.getStatusOptions();
      setStatusOptions(options);
    } catch (error) {
      console.error("Error loading status options:", error);
    }
  };

  // Handle navigation params to open friend detail modal
  useEffect(() => {
    const params = route.params as { friendId?: string } | undefined;
    const friendId = params?.friendId;
    if (friendId) {
      // Store the friendId we're waiting for
      pendingFriendIdRef.current = friendId;
      
      // Refresh friends status first to ensure we have the latest data
      loadFriendsStatus().catch((error) => {
        console.error("Error refreshing friend status:", error);
        // If refresh fails, try to open modal with existing data
        const friend = friendsStatus.find((f) => f.user_id === friendId);
        if (friend) {
          setSelectedFriend(friend);
          setFriendModalVisible(true);
        }
        pendingFriendIdRef.current = null;
        if (navigation.isFocused()) {
          navigation.setParams({ friendId: undefined } as any);
        }
      });
    }
  }, [(route.params as { friendId?: string } | undefined)?.friendId]);

  // Open modal when friendsStatus updates and we have a pending friendId
  useEffect(() => {
    if (pendingFriendIdRef.current && friendsStatus.length > 0) {
      const friend = friendsStatus.find((f) => f.user_id === pendingFriendIdRef.current);
      if (friend) {
        setSelectedFriend(friend);
        setFriendModalVisible(true);
      }
      // Clear the pending friendId and navigation param
      pendingFriendIdRef.current = null;
      setTimeout(() => {
        if (navigation.isFocused()) {
          navigation.setParams({ friendId: undefined } as any);
        }
      }, 100);
    }
  }, [friendsStatus, navigation]);

  // Check if we should show the refresh hint
  const checkRefreshHint = async () => {
    try {
      const hasSeenHint = await AsyncStorage.getItem("hasSeenRefreshHint");
      if (!hasSeenHint) {
        // Show hint after a short delay for better UX
        setTimeout(() => {
          setShowRefreshHint(true);
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 50,
            friction: 8,
          }).start();
        }, 1000);
      }
    } catch (error) {
      console.error("Error checking refresh hint:", error);
    }
  };

  // Hide the hint and mark as seen
  const dismissRefreshHint = async () => {
    try {
      await AsyncStorage.setItem("hasSeenRefreshHint", "true");
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setShowRefreshHint(false);
      });
    } catch (error) {
      console.error("Error dismissing refresh hint:", error);
      setShowRefreshHint(false);
    }
  };

  // Helper function to close friend modal
  const closeFriendModal = React.useCallback(() => {
    setFriendModalVisible(false);
    setSelectedFriend(null);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadStatusOptions(),
        loadFriendsStatus(),
        loadCurrentStatus(),
      ]);
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

      // Save friend statuses to widget storage
      await widgetStorageService.saveAllFriendStatuses(statuses);
    } catch (error) {
      console.error("Error loading friends status:", error);
    }
  };

  const handleStatusButtonPress = (option: StatusOption) => {
    setSelectedOption(option);
    setModalVisible(true);
  };

  const handleStatusConfirm = async (
    optionId: string,
    note?: string,
    expiresAt?: Date
  ) => {
    setLoading(true);
    try {
      const updatedStatus = await statusService.updateStatus(
        optionId,
        note,
        expiresAt
      );
      setMyStatus(updatedStatus);
      setModalVisible(false);
      setSelectedOption(null);
    } catch (error: any) {
      console.error("Error updating status:", error);
      Toast.show({
        type: "error",
        text1: error.message || "Check your connection and try again.",
      });
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
      {/* Refresh Hint Banner */}
      {showRefreshHint && (
        <Animated.View
          style={[
            styles.refreshHintBanner,
            {
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.refreshHintContent}>
            <Ionicons name="arrow-down" size={20} color="#007AFF" />
            <Text style={styles.refreshHintText}>
              Pull down to refresh your friends' statuses
            </Text>
          </View>
          <TouchableOpacity
            onPress={dismissRefreshHint}
            style={styles.refreshHintClose}
          >
            <Ionicons name="close" size={20} color="#6B7280" />
          </TouchableOpacity>
        </Animated.View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#007AFF"
            colors={["#007AFF"]}
            progressViewOffset={showRefreshHint ? 130 : 80}
          />
        }
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            { paddingTop: Math.max(insets.top + 10, 40) },
            showRefreshHint && { marginTop: 50 },
          ]}
        >
          <View style={styles.headerContent}>
            <Text style={styles.greeting}>Hello, </Text>
            <Text style={styles.userName}>{user?.first_name || "User"}</Text>
          </View>
        </View>

        {/* My Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.cardTitleContainer}>
            <Text style={styles.cardTitle}>Your Status</Text>
            <TouchableOpacity
              style={[
                styles.manageButton,
                !isPremium && styles.manageButtonLocked,
                premiumLoading && styles.manageButtonLoading,
              ]}
              onPress={handleManageStatusPress}
              disabled={premiumLoading}
            >
              {premiumLoading ? (
                <ActivityIndicator size="small" color="#007AFF" />
              ) : (
                <>
                  {!isPremium && (
                    <Ionicons
                      name="lock-closed"
                      size={14}
                      color="#007AFF"
                      style={styles.lockIcon}
                    />
                  )}
                  <Text
                    style={[
                      styles.manageButtonText,
                      !isPremium && styles.manageButtonTextLocked,
                    ]}
                  >
                    Manage Status
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.statusButtonsContainer}>
            {statusOptions.map((option) => {
              const isActive = currentOptionId === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.statusButton,
                    isActive && styles.statusButtonActive,
                    isActive && { backgroundColor: option.color },
                  ]}
                  onPress={() => handleStatusButtonPress(option)}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <Text style={styles.statusIcon}>{option.emoji}</Text>
                  <Text
                    style={[
                      styles.statusButtonText,
                      isActive && styles.statusButtonTextActive,
                    ]}
                  >
                    {option.label}
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
                        {
                          backgroundColor:
                            (status.option?.color || "#10B981") + "20",
                        },
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
                          {
                            backgroundColor: status.option?.color || "#10B981",
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName} numberOfLines={1}>
                        {displayName}
                      </Text>
                      <View style={styles.friendStatusRow}>
                        <View style={styles.friendStatusContent}>
                          <Text style={styles.friendStatus} numberOfLines={1}>
                            {status.option?.emoji || "🟢"}{" "}
                            {status.option?.label || "Available"}
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
      {selectedOption && (
        <StatusChangeModal
          visible={modalVisible}
          selectedOption={selectedOption}
          onClose={() => {
            setModalVisible(false);
            setSelectedOption(null);
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
        onRequestClose={closeFriendModal}
      >
        <TouchableWithoutFeedback onPress={closeFriendModal}>
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
                        onPress={closeFriendModal}
                        style={styles.friendModalCloseButton}
                      >
                        <Ionicons name="close" size={24} color="#6B7280" />
                      </TouchableOpacity>
                    </View>

                    {/* Status */}
                    <View style={styles.friendModalSection}>
                      <Text style={styles.friendModalLabel}>Status</Text>
                      <View style={styles.friendModalStatusRow}>
                        <Text style={styles.friendModalStatusEmoji}>
                          {selectedFriend.option?.emoji || "🟢"}
                        </Text>
                        <View
                          style={[
                            styles.friendModalStatusDot,
                            {
                              backgroundColor:
                                selectedFriend.option?.color || "#10B981",
                            },
                          ]}
                        />
                        <Text style={styles.friendModalStatusText}>
                          {selectedFriend.option?.label || "Available"}
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
                      onPress={closeFriendModal}
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
  refreshHintBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#EFF6FF",
    borderBottomWidth: 1,
    borderBottomColor: "#DBEAFE",
    paddingTop: 50, // Account for status bar
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 1000,
    // No shadows, no elevation - using physical shift transform instead
  },
  refreshHintContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
  },
  refreshHintText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#007AFF",
  },
  refreshHintClose: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    paddingTop: 60, // Base padding, will be overridden by inline style
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
    // No shadows, no elevation - using physical shift transform instead
  },
  cardTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  manageButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
  },
  manageButtonLocked: {
    opacity: 0.6,
  },
  manageButtonLoading: {
    opacity: 0.7,
  },
  lockIcon: {
    marginRight: 4,
  },
  manageButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#007AFF",
  },
  manageButtonTextLocked: {
    // Keep same styling, opacity is handled by parent
  },
  statusButtonsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginHorizontal: -4, // Negative margin to offset button margins
  },
  statusButton: {
    width: "31%",
    height: 100, // Fixed height to ensure all buttons are the same size
    marginHorizontal: 4, // Add horizontal margin for spacing
    marginBottom: 12,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
    position: "relative",
  },
  statusButtonActive: {
    borderColor: "#FFFFFF",
    // No shadows, no elevation - using physical shift transform instead
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
    // No shadows, no elevation - using physical shift transform instead
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
    minWidth: 0, // Allow flex shrinking for text truncation
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
    minWidth: 0, // Allow flex shrinking for text truncation
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
    padding: Math.min(20, 12), // Reduce padding on very small screens
  },
  friendModalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    minWidth: 280, // Ensure minimum width for readability
    // No shadows, no elevation - using physical shift transform instead
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
  friendModalStatusEmoji: {
    fontSize: 20,
    marginRight: 8,
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

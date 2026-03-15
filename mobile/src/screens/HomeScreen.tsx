import React, { useState, useEffect } from "react";
import {
  View,
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
import { SafeAreaView } from "react-native-safe-area-context";
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
import { Colors, Borders, Spacing, Typography, useResponsive } from "../design";
import { Text } from "../components/primitives/Text";
import { Button } from "../components/actions/Button";

export default function HomeScreen() {
  const { horizontalPadding } = useResponsive();
  const navigation = useNavigation();
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
  const [friendLayoutMode, setFriendLayoutMode] = useState<"large" | "compact">("large");
  const slideAnim = React.useRef(new Animated.Value(-100)).current;
  const pendingFriendIdRef = React.useRef<string | null>(null);

  const FRIEND_LAYOUT_STORAGE_KEY = "home_friend_layout_mode";

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

  useEffect(() => {
    AsyncStorage.getItem(FRIEND_LAYOUT_STORAGE_KEY).then((value) => {
      if (value === "compact" || value === "large") setFriendLayoutMode(value);
    });
  }, []);

  const setFriendLayoutModeAndPersist = (mode: "large" | "compact") => {
    setFriendLayoutMode(mode);
    AsyncStorage.setItem(FRIEND_LAYOUT_STORAGE_KEY, mode);
  };

  const loadStatusOptions = async () => {
    try {
      const options = await statusOptionService.getStatusOptions();
      setStatusOptions(options);
    } catch {
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
      loadFriendsStatus().catch(() => {
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
    } catch {
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
    } catch {
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
    } catch {
    }
  };
  const loadCurrentStatus = async () => {
    try {
      const status = await statusService.getMyStatus();
      setMyStatus(status);
    } catch {
    }
  };

  const loadFriendsStatus = async () => {
    try {
      const statuses = await statusService.getFriendsStatus();
      setFriendsStatus(statuses);

      // Save friend statuses to widget storage
      await widgetStorageService.saveAllFriendStatuses(statuses);
    } catch {
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
    <SafeAreaView style={styles.container} edges={["top"]}>
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
            <Ionicons
              name="arrow-down"
              size={20}
              color={Colors.interaction.primary}
            />
            <Text variant="primary" style={styles.refreshHintText}>
              Pull down to refresh
            </Text>
          </View>
          <TouchableOpacity
            onPress={dismissRefreshHint}
            style={styles.refreshHintClose}
          >
            <Ionicons
              name="close"
              size={20}
              color={Colors.text.secondary}
            />
          </TouchableOpacity>
        </Animated.View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            flexGrow: 1,
            paddingTop: Spacing.md + (showRefreshHint ? 56 : 0),
            paddingHorizontal: horizontalPadding,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.interaction.primary}
            colors={[Colors.interaction.primary]}
            progressViewOffset={showRefreshHint ? 130 : 80}
          />
        }
      >
        {/* My Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.cardTitleContainer}>
            <Text variant="primary" style={styles.cardTitle}>
              Your Status
            </Text>
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
                <ActivityIndicator size="small" color={Colors.interaction.primary} />
              ) : (
                <>
                  {!isPremium && (
                    <Ionicons
                      name="lock-closed"
                      size={14}
                      color={Colors.interaction.primary}
                      style={styles.lockIcon}
                    />
                  )}
                  <Text style={styles.manageButtonText}>Manage Status</Text>
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
            <Text variant="secondary" style={styles.expirationText}>
              {formatExpirationTime(myStatus.expires_at)}
            </Text>
          )}
        </View>

        {/* Friends Section */}
        <View style={styles.friendsSection}>
          <View style={styles.sectionHeader}>
            <Text variant="primary" style={styles.sectionTitle}>
              Friends
            </Text>
            <View style={styles.headerRight}>
              {friendsStatus.length > 0 && (
                <View style={styles.layoutToggle}>
                  <TouchableOpacity
                    style={[
                      styles.layoutToggleButton,
                      friendLayoutMode === "large" && styles.layoutToggleButtonActive,
                    ]}
                    onPress={() => setFriendLayoutModeAndPersist("large")}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="list"
                      size={16}
                      color={friendLayoutMode === "large" ? "#FFFFFF" : Colors.text.secondary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.layoutToggleButton,
                      friendLayoutMode === "compact" && styles.layoutToggleButtonActive,
                    ]}
                    onPress={() => setFriendLayoutModeAndPersist("compact")}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="grid"
                      size={14}
                      color={friendLayoutMode === "compact" ? "#FFFFFF" : Colors.text.secondary}
                    />
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.friendCount}>
                <Ionicons
                  name="people-outline"
                  size={14}
                  color={Colors.text.secondary}
                  style={styles.friendCountIcon}
                />
                <Text style={styles.friendCountText}>{friendsStatus.length}</Text>
              </View>
              <TouchableOpacity
                style={styles.connectButton}
                onPress={() =>
                  (navigation.getParent() as any)?.navigate("Connect")
                }
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

          {refreshing && friendsStatus.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={Colors.interaction.primary} />
            </View>
          ) : friendsStatus.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <Text style={styles.emptyIcon}>👥</Text>
              </View>
              <Text variant="primary" style={styles.emptyTitle}>
                No friends yet
              </Text>
              <Text variant="secondary" style={styles.emptyText}>
                Add friends to see their status
              </Text>
              <Button
                variant="primary"
                onPress={() =>
                  (navigation.getParent() as any)?.navigate("Connect")
                }
                style={styles.emptyConnectButton}
              >
                Connect
              </Button>
            </View>
          ) : friendLayoutMode === "compact" ? (
            <View style={styles.friendsGrid}>
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
                    style={styles.friendCardCompact}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedFriend(status);
                      setFriendModalVisible(true);
                    }}
                  >
                    <View
                      style={[
                        styles.avatarCompact,
                        {
                          backgroundColor:
                            (status.option?.color || Colors.interaction.primary) + "20",
                        },
                      ]}
                    >
                      <Text variant="primary" style={styles.avatarTextCompact}>
                        {status.avatar_url ? "IMG" : initials}
                      </Text>
                    </View>
                    <Text
                      variant="primary"
                      style={styles.friendNameCompact}
                      numberOfLines={1}
                    >
                      {displayName}
                    </Text>
                    <Text variant="secondary" style={styles.friendEmojiCompact}>
                      {status.option?.emoji || "🟢"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
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
                            (status.option?.color || Colors.interaction.primary) + "20",
                        },
                      ]}
                    >
                      <Text variant="primary" style={styles.avatarText}>
                        {status.avatar_url ? "IMG" : initials}
                      </Text>
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
                        <View style={styles.friendStatusContent}>
                          <Text variant="secondary" numberOfLines={1}>
                            {status.option?.emoji || "🟢"}{" "}
                            {status.option?.label || "Available"}
                            {status.note && ` • ${status.note}`}
                          </Text>
                          {status.expires_at && (
                            <Text variant="secondary" style={styles.friendExpirationText}>
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
                      <Text
                        variant="primary"
                        style={styles.friendModalTitle}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {getDisplayName(
                          selectedFriend.first_name,
                          selectedFriend.last_name
                        )}
                      </Text>
                      <TouchableOpacity
                        onPress={closeFriendModal}
                        style={styles.friendModalCloseButton}
                      >
                        <Ionicons
                          name="close"
                          size={24}
                          color={Colors.text.secondary}
                        />
                      </TouchableOpacity>
                    </View>

                    {/* Status */}
                    <View style={styles.friendModalSection}>
                      <Text variant="secondary" style={styles.friendModalLabel}>
                        Status
                      </Text>
                      <View style={styles.friendModalStatusRow}>
                        <Text style={styles.friendModalStatusEmoji}>
                          {selectedFriend.option?.emoji || "🟢"}
                        </Text>
                        <Text variant="primary" style={styles.friendModalStatusText}>
                          {selectedFriend.option?.label || "Available"}
                        </Text>
                      </View>
                    </View>

                    {/* Note */}
                    {selectedFriend.note && (
                      <View style={styles.friendModalSection}>
                        <Text variant="secondary" style={styles.friendModalLabel}>
                          Note
                        </Text>
                        <Text variant="primary" style={styles.friendModalNote}>
                          {selectedFriend.note}
                        </Text>
                      </View>
                    )}

                    {/* Expires At */}
                    {selectedFriend.expires_at && (
                      <View style={styles.friendModalSection}>
                        <Text variant="secondary" style={styles.friendModalLabel}>
                          Expires
                        </Text>
                        <Text variant="secondary">
                          {formatExpirationTime(selectedFriend.expires_at)}
                        </Text>
                      </View>
                    )}

                    {/* Close Button */}
                    <Button variant="primary" onPress={closeFriendModal}>
                      Close
                    </Button>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas.background,
  },
  refreshHintBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ECFDF5",
    paddingTop: 50,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 1000,
  },
  refreshHintContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: Spacing.sm,
  },
  refreshHintText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
  },
  refreshHintClose: {
    padding: Spacing.xs,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.lg,
  },
  statusCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: "#F9FAFB",
    borderRadius: Borders.radius.medium,
    padding: Spacing.md,
  },
  cardTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.semiBold,
    flexShrink: 1,
    minWidth: 0,
  },
  manageButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Borders.radius.medium,
    backgroundColor: Colors.interaction.primary + "15",
    flexShrink: 0,
  },
  manageButtonLocked: {
    opacity: 0.6,
  },
  manageButtonLoading: {
    opacity: 0.7,
  },
  lockIcon: {
    marginRight: Spacing.xs,
  },
  manageButtonText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.interaction.primary,
  },
  statusButtonsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  statusButton: {
    height: 100,
    flexGrow: 1,
    minWidth: "30%",
    backgroundColor: "#F3F4F6",
    borderRadius: Borders.radius.medium,
    padding: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
    position: "relative",
  },
  statusButtonActive: {
    borderColor: Colors.canvas.background,
  },
  statusIcon: {
    fontSize: 22,
    lineHeight: 26,
    includeFontPadding: false,
    marginBottom: Spacing.sm,
  },
  statusButtonText: {
    color: Colors.text.secondary,
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
    textAlign: "center",
  },
  statusButtonTextActive: {
    color: Colors.canvas.background,
  },
  activeIndicator: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.canvas.background,
  },
  friendsSection: {
    marginTop: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.semiBold,
    flexShrink: 1,
    minWidth: 0,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexShrink: 0,
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
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
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
    justifyContent: "center",
    minHeight: 200,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
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
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  emptyConnectButton: {
    marginTop: Spacing.sm,
  },
  layoutToggle: {
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
    borderRadius: Borders.radius.small,
    padding: 2,
    borderWidth: Borders.width,
    borderColor: Colors.text.secondary + "40",
  },
  layoutToggleButton: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Borders.radius.small - 2,
  },
  layoutToggleButtonActive: {
    backgroundColor: Colors.interaction.primary,
  },
  friendsList: {
    gap: Spacing.md,
  },
  friendsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  friendCardCompact: {
    backgroundColor: "#F9FAFB",
    borderRadius: Borders.radius.medium,
    padding: Spacing.sm,
    alignItems: "center",
    flexGrow: 1,
    minWidth: "30%",
    overflow: "visible",
  },
  avatarCompact: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
    position: "relative",
  },
  avatarTextCompact: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
  },
  friendNameCompact: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semiBold,
    marginBottom: 2,
    textAlign: "center",
  },
  friendEmojiCompact: {
    fontSize: 18,
    lineHeight: 26,
    includeFontPadding: false,
    paddingTop: 2,
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: Borders.radius.medium,
    padding: Spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
    position: "relative",
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
    fontFamily: Typography.fontFamily.semiBold,
    marginBottom: Spacing.xs,
  },
  friendStatusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  friendStatusContent: {
    flex: 1,
    minWidth: 0,
  },
  friendExpirationText: {
    fontSize: 12,
    marginTop: 2,
  },
  expirationText: {
    marginTop: Spacing.sm,
    textAlign: "center",
    fontStyle: "italic",
  },
  friendModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  friendModalContent: {
    backgroundColor: Colors.canvas.background,
    borderRadius: Borders.radius.large,
    padding: Spacing.lg,
    width: "100%",
    maxWidth: 400,
    minWidth: 280,
  },
  friendModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  friendModalTitle: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.semiBold,
    flex: 1,
  },
  friendModalCloseButton: {
    padding: Spacing.xs,
  },
  friendModalSection: {
    marginBottom: Spacing.md,
  },
  friendModalLabel: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    marginBottom: Spacing.xs,
  },
  friendModalStatusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  friendModalStatusEmoji: {
    fontSize: 20,
    marginRight: Spacing.sm,
  },
  friendModalStatusText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
  },
  friendModalNote: {
    lineHeight: 22,
  },
});

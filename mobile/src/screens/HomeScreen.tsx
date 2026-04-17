import React, { useState, useEffect, useCallback } from "react";
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
  Alert,
} from "react-native";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Status, StatusOption, Connection } from "../types";
import { statusService } from "../services/status.service";
import { statusOptionService } from "../services/status-option.service";
import { widgetStorageService } from "../services/widget-storage.service";
import { connectionsService } from "../services/connections.service";
import StatusChangeModal from "../components/StatusChangeModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Toast from "react-native-toast-message";
import Sentry from "../../sentry";
import { useIsPremium } from "../hooks/useIsPremium";
import { useAuth } from "../contexts/AuthContext";
import { presentPaywall } from "../services/purchases.service";
import { Colors, Borders, Spacing, Typography, useResponsive, useColors } from "../design";
import { Text } from "../components/primitives/Text";
import { Button } from "../components/actions/Button";

export default function HomeScreen() {
  const { width: screenWidth, horizontalPadding, fs } = useResponsive();
  const availableStatusWidth = screenWidth - horizontalPadding * 2 - Spacing.md * 2;
  const statusCols = Math.min(2, Math.max(1, Math.floor((availableStatusWidth + Spacing.md) / (140 + Spacing.md))));
  const statusButtonWidth = (availableStatusWidth - Spacing.md * (statusCols - 1)) / statusCols;
  const colors = useColors();
  const navigation = useNavigation();
  const route = useRoute();
  const { isPremium, loading: premiumLoading } = useIsPremium();
  const { refreshUser } = useAuth();
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
  const [connections, setConnections] = useState<Connection[]>([]);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(-100)).current;
  const pendingFriendIdRef = React.useRef<string | null>(null);
  const refreshHintTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
        // User purchased/restored - re-sync backend premium status before navigating
        await refreshUser();
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
    return () => {
      if (refreshHintTimerRef.current) clearTimeout(refreshHintTimerRef.current);
    };
  }, []);

  useEffect(() => {
    loadStatusOptions();
    loadFriendsStatus().catch(() => {
      Toast.show({
        type: "error",
        text1: "Failed to load friends. Check your connection.",
      });
    });
    loadCurrentStatus().catch(() => {});
    checkRefreshHint();
    loadConnections();
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
    } catch (error) {
      Sentry.captureException(error);
    }
  };

  // Reload status options whenever this screen comes back into focus
  // so changes made in ManageStatusScreen are reflected immediately.
  useFocusEffect(
    useCallback(() => {
      loadStatusOptions();
    }, [])
  );

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
        refreshHintTimerRef.current = setTimeout(() => {
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

  const getConnectionForFriend = (userId: string): Connection | null =>
    connections.find((c) => c.friend_id === userId) ?? null;

  const handleRefresh = async () => {
    setRefreshing(true);
    const results = await Promise.allSettled([
      loadStatusOptions(),
      loadFriendsStatus(),
      loadCurrentStatus(),
      loadConnections(),
    ]);
    setRefreshing(false);
    if (results.some((r) => r.status === "rejected")) {
      Toast.show({
        type: "error",
        text1: "Failed to refresh. Check your connection.",
      });
    }
  };

  const loadCurrentStatus = async () => {
    const status = await statusService.getMyStatus();
    setMyStatus(status);
  };

  const loadConnections = async () => {
    try {
      const conns = await connectionsService.getConnections();
      setConnections(conns);
    } catch (error) {
      Sentry.captureException(error);
    }
  };

  const handleToggleVisibility = async () => {
    if (!selectedFriend || togglingVisibility) return;
    const connection = getConnectionForFriend(selectedFriend.user_id);
    if (!connection) return;
    const newShowsStatus = !connection.user_shows_status;
    setTogglingVisibility(true);
    try {
      await connectionsService.updateVisibility(selectedFriend.user_id, newShowsStatus);
      Toast.show({
        type: "success",
        text1: newShowsStatus
          ? "You've enabled status sharing with them."
          : "You've hidden your status from them.",
      });
      await loadConnections();
    } catch (error: any) {
      Toast.show({ type: "error", text1: "Failed to update. Try again." });
    } finally {
      setTogglingVisibility(false);
    }
  };

  const handleRemoveFriend = () => {
    if (!selectedFriend) return;
    const name = getDisplayName(selectedFriend.first_name, selectedFriend.last_name);
    Alert.alert(
      "Remove Friend",
      `Are you sure you want to remove ${name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await connectionsService.deleteConnection(selectedFriend.user_id);
              closeFriendModal();
              await Promise.all([loadFriendsStatus(), loadConnections()]);
              Toast.show({ type: "success", text1: `${name} removed.` });
            } catch (error: any) {
              Toast.show({ type: "error", text1: "Failed to remove. Try again." });
            }
          },
        },
      ]
    );
  };

  const loadFriendsStatus = async () => {
    const statuses = await statusService.getFriendsStatus();
    setFriendsStatus(statuses);
    // Best-effort — widget storage failure should not surface as a "failed to load friends" error
    widgetStorageService.saveAllFriendStatuses(statuses).catch(() => {});
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
      Sentry.captureException(error);
      Toast.show({
        type: "error",
        text1: error.message || "Check your connection and try again.",
      });
      throw error;
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
      Sentry.captureException(error);
      return null;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.canvas.background }]} edges={["top"]}>
      {/* Refresh Hint Banner */}
      {showRefreshHint && (
        <Animated.View
          style={[
            styles.refreshHintBanner,
            { backgroundColor: colors.tint.mint },
            {
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.refreshHintContent}>
            <Ionicons
              name="arrow-down"
              size={20}
              color={colors.interaction.primary}
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
              color={colors.text.secondary}
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
            tintColor={colors.interaction.primary}
            colors={[colors.interaction.primary]}
            progressViewOffset={showRefreshHint ? 130 : 80}
          />
        }
      >
        {/* My Status Card */}
        <View style={[styles.statusCard, { backgroundColor: colors.canvas.card }]}>
          <View style={styles.cardTitleContainer}>
            <Text style={styles.cardTitle}>YOUR STATUS</Text>
            <TouchableOpacity
              style={styles.manageButton}
              onPress={handleManageStatusPress}
              disabled={premiumLoading}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {premiumLoading ? (
                <ActivityIndicator size="small" color={colors.interaction.primary} />
              ) : isPremium ? (
                <Ionicons name="settings-outline" size={20} color={colors.text.secondary} />
              ) : (
                <View style={styles.premiumBadge}>
                  <Ionicons name="diamond-outline" size={14} color={colors.interaction.accent} />
                  <Text style={[styles.premiumBadgeText, { color: colors.interaction.accent }]}>PRO</Text>
                </View>
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
                    { width: statusButtonWidth, height: fs(100), backgroundColor: colors.canvas.subtle },
                    isActive && styles.statusButtonActive,
                    isActive && { backgroundColor: option.color, borderColor: colors.canvas.background },
                  ]}
                  onPress={() => handleStatusButtonPress(option)}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.statusIcon, { fontSize: fs(22), lineHeight: fs(26) }]}>{option.emoji}</Text>
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.statusButtonText,
                      { fontSize: fs(14), color: colors.text.secondary },
                      isActive && { color: colors.canvas.background },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {isActive && <View style={[styles.activeIndicator, { backgroundColor: colors.canvas.background }]} />}
                </TouchableOpacity>
              );
            })}
          </View>
          {myStatus && myStatus.expires_at && formatExpirationTime(myStatus.expires_at) && (
            <View style={styles.expirationRow}>
              <Ionicons name="time-outline" size={12} color="#F59E0B" />
              <Text style={styles.expirationText}>{formatExpirationTime(myStatus.expires_at)}</Text>
            </View>
          )}
        </View>

        {/* Friends Section */}
        <View style={styles.friendsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>FRIENDS</Text>
            <View style={styles.headerRight}>
              {friendsStatus.length > 0 && (
                <View style={[styles.layoutToggle, { backgroundColor: colors.canvas.card, borderColor: colors.text.secondary + "40" }]}>
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
                      color={friendLayoutMode === "large" ? "#FFFFFF" : colors.text.secondary}
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
                      color={friendLayoutMode === "compact" ? "#FFFFFF" : colors.text.secondary}
                    />
                  </TouchableOpacity>
                </View>
              )}
              <View style={[styles.friendCount, { backgroundColor: colors.tint.mint }]}>
                <Ionicons
                  name="people-outline"
                  size={14}
                  color={colors.text.secondary}
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
                  color={colors.interaction.primary}
                />
                <Text style={styles.connectButtonText}>Connect</Text>
              </TouchableOpacity>
            </View>
          </View>

          {refreshing && friendsStatus.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.interaction.primary} />
            </View>
          ) : friendsStatus.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconCircle, { backgroundColor: colors.canvas.subtle }]}>
                <Ionicons name="people-outline" size={fs(32)} color={colors.text.secondary} />
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
                    style={[styles.friendCardCompact, { backgroundColor: colors.canvas.card }]}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedFriend(status);
                      setFriendModalVisible(true);
                    }}
                  >
                    <View style={styles.friendNameRowCompact}>
                      <Text
                        variant="primary"
                        style={styles.friendNameCompact}
                        numberOfLines={1}
                      >
                        {displayName}
                      </Text>
                      {getConnectionForFriend(status.user_id)?.user_shows_status === false && (
                        <Ionicons name="eye-off-outline" size={11} color={colors.text.secondary} />
                      )}
                    </View>
                    <Text variant="secondary" style={styles.friendStatusCompact} numberOfLines={1}>
                      {status.option?.emoji || "🟢"} {status.option?.label || "Available"}
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
                    style={[styles.friendCard, { backgroundColor: colors.canvas.card }]}
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
                          width: fs(56),
                          height: fs(56),
                          borderRadius: fs(28),
                        },
                      ]}
                    >
                      <Text variant="primary" style={[styles.avatarText, { fontSize: fs(20) }]}>
                        {initials}
                      </Text>
                    </View>
                    <View style={styles.friendInfo}>
                      <View style={styles.friendNameRow}>
                        <Text
                          variant="primary"
                          style={[styles.friendName, { fontSize: fs(16) }]}
                          numberOfLines={1}
                        >
                          {displayName}
                        </Text>
                        {getConnectionForFriend(status.user_id)?.user_shows_status === false && (
                          <Ionicons name="eye-off-outline" size={13} color={colors.text.secondary} />
                        )}
                      </View>
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
              <View style={[styles.friendModalContent, { backgroundColor: colors.canvas.background }]}>
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
                          color={colors.text.secondary}
                        />
                      </TouchableOpacity>
                    </View>

                    {/* Status */}
                    <View style={styles.friendModalSection}>
                      <Text style={styles.friendModalLabel}>STATUS</Text>
                      <View style={styles.friendModalStatusRow}>
                        <Text style={styles.friendModalStatusEmoji}>
                          {selectedFriend.option?.emoji || "🟢"}
                        </Text>
                        <Text variant="primary" style={styles.friendModalStatusText} numberOfLines={2}>
                          {selectedFriend.option?.label || "Available"}
                        </Text>
                      </View>
                    </View>

                    {/* Note */}
                    {selectedFriend.note && (
                      <View style={styles.friendModalSection}>
                        <Text style={styles.friendModalLabel}>NOTE</Text>
                        <Text variant="primary" style={styles.friendModalNote} numberOfLines={4}>
                          {selectedFriend.note}
                        </Text>
                      </View>
                    )}

                    {/* Expires At */}
                    {selectedFriend.expires_at && (
                      <View style={styles.friendModalSection}>
                        <Text style={styles.friendModalLabel}>EXPIRES</Text>
                        <Text variant="secondary">
                          {formatExpirationTime(selectedFriend.expires_at)}
                        </Text>
                      </View>
                    )}

                    {/* Manage Actions */}
                    {getConnectionForFriend(selectedFriend.user_id) && (
                      <>
                        <View style={[styles.friendModalDivider, { backgroundColor: colors.text.secondary }]} />
                        {!getConnectionForFriend(selectedFriend.user_id)?.user_shows_status && (
                          <View style={[styles.friendModalHiddenNoteBox, { backgroundColor: colors.canvas.card }]}>
                            <Ionicons name="eye-off-outline" size={13} color={colors.text.secondary} />
                            <Text variant="secondary" style={styles.friendModalHiddenNote}>
                              You've hidden your status from them, so they can't see yours either.
                            </Text>
                          </View>
                        )}
                        <TouchableOpacity
                          style={styles.friendModalActionButton}
                          onPress={handleToggleVisibility}
                          disabled={togglingVisibility}
                          activeOpacity={0.7}
                        >
                          {togglingVisibility ? (
                            <ActivityIndicator size="small" color={colors.text.secondary} />
                          ) : (
                            <Text variant="secondary" style={styles.friendModalActionText}>
                              {getConnectionForFriend(selectedFriend.user_id)?.user_shows_status
                                ? "Hide my status"
                                : "Show my status"}
                            </Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.friendModalRemoveButton}
                          onPress={handleRemoveFriend}
                          activeOpacity={0.7}
                        >
                          <Text variant="primary" style={styles.friendModalRemoveText}>Remove friend</Text>
                        </TouchableOpacity>
                      </>
                    )}
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
  },
  refreshHintBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
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
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
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
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    letterSpacing: 0.8,
    flexShrink: 1,
    minWidth: 0,
  },
  manageButton: {
    padding: Spacing.xs,
  },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  premiumBadgeText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.semiBold,
    letterSpacing: 0.5,
  },
  statusButtonsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  statusButton: {
    height: 100,
    borderRadius: Borders.radius.medium,
    padding: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
    position: "relative",
  },
  statusButtonActive: {},
  statusIcon: {
    fontSize: 22,
    lineHeight: 26,
    includeFontPadding: false,
    marginBottom: Spacing.sm,
  },
  statusButtonText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
    textAlign: "center",
  },
  activeIndicator: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    width: 8,
    height: 8,
    borderRadius: 4,
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
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    letterSpacing: 0.8,
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
    color: Colors.interaction.primary, // stays mint
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
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
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
    borderRadius: Borders.radius.small,
    padding: 2,
    borderWidth: Borders.width,
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
    borderRadius: Borders.radius.medium,
    padding: Spacing.sm,
    alignItems: "center",
    width: "48%",
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
  friendNameRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    marginBottom: 2,
  },
  friendNameCompact: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semiBold,
    textAlign: "center",
    flexShrink: 1,
  },
  friendStatusCompact: {
    fontSize: 12,
    textAlign: "center",
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
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
  friendNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  friendName: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
    flexShrink: 1,
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
    color: "#F59E0B",
  },
  expirationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  expirationText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: "#F59E0B",
  },
  friendModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  friendModalContent: {
    borderRadius: Borders.radius.large,
    padding: Spacing.lg,
    width: "100%",
    maxWidth: 400,
    minWidth: 280,
    maxHeight: "85%",
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
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    letterSpacing: 0.8,
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
    flex: 1,
  },
  friendModalNote: {
    lineHeight: 22,
  },
  friendModalDivider: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.3,
    marginVertical: Spacing.md,
  },
  friendModalHiddenNoteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.xs,
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  friendModalHiddenNote: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  friendModalActionButton: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  friendModalActionText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
  },
  friendModalRemoveButton: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
  },
  friendModalRemoveText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.interaction.error, // always red
  },
});

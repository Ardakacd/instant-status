import React, { useState, useEffect, useCallback, useRef } from "react";
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
  AppState,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Status, StatusOption, Connection } from "../types";
import { statusService } from "../services/status.service";
import { statusOptionService } from "../services/status-option.service";
import { widgetStorageService } from "../services/widget-storage.service";
import { connectionsService } from "../services/connections.service";
import { subscribeFriendStatusUpdated } from "../utils/friend-status-events";
import StatusChangeModal from "../components/StatusChangeModal";
import ReportSheet from "../components/ReportSheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { toast } from "../utils/toast";
import Sentry from "../../sentry";
import { useIsPremium } from "../hooks/useIsPremium";
import { useAuth } from "../contexts/AuthContext";
import { presentPaywall } from "../services/purchases.service";
import {
  Colors,
  Borders,
  Spacing,
  Typography,
  useResponsive,
  useColors,
  useTheme,
} from "../design";
import { Text } from "../components/primitives/Text";
import { Button } from "../components/actions/Button";

export default function HomeScreen() {
  const { horizontalPadding, fs } = useResponsive();
  const colors = useColors();
  const { isDark } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const { isPremium, loading: premiumLoading } = useIsPremium();
  const { user, refreshUser } = useAuth();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 5) return "Good night";
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };
  const userName = user?.first_name || "there";
  const [myStatus, setMyStatus] = useState<Status | null>(null);
  const [friendsStatus, setFriendsStatus] = useState<Status[]>([]);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedOption, setSelectedOption] = useState<StatusOption | null>(
    null,
  );
  const [friendModalVisible, setFriendModalVisible] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<Status | null>(null);
  const [showRefreshHint, setShowRefreshHint] = useState(false);
  const [friendLayoutMode, setFriendLayoutMode] = useState<"large" | "compact">(
    "large",
  );
  const [connections, setConnections] = useState<Connection[]>([]);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(-100)).current;
  const pendingFriendIdRef = React.useRef<string | null>(null);
  const refreshHintTimerRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const FRIEND_LAYOUT_STORAGE_KEY = "home_friend_layout_mode";


  // Enable LayoutAnimation on Android
  if (
    Platform.OS === "android" &&
    UIManager.setLayoutAnimationEnabledExperimental
  ) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }

  const displayStatusOptions = statusOptions;
  const displayMyStatus = myStatus;
  const displayFriendsStatus = friendsStatus;
  const currentOptionId = displayMyStatus?.option?.id || null;

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
      toast.show({
        type: "error",
        text1:
          error.message ||
          "Failed to open subscription options. Please try again.",
      });
    }
  };

  useEffect(() => {
    return () => {
      if (refreshHintTimerRef.current)
        clearTimeout(refreshHintTimerRef.current);
    };
  }, []);

  // Initial data load is handled by useFocusEffect (runs on first focus too).
  // Avoid duplicate GET /status/friends here — mount + focus was doubling requests and hitting throttles.
  useEffect(() => {
    checkRefreshHint();
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(FRIEND_LAYOUT_STORAGE_KEY).then((value) => {
      if (value === "compact" || value === "large") setFriendLayoutMode(value);
    });
  }, []);

  // Refresh friends when a push notification arrives while app is in foreground
  useEffect(() => {
    return subscribeFriendStatusUpdated(() => {
      loadFriendsStatus().catch(() => {});
    });
  }, []);

  const setFriendLayoutModeAndPersist = (mode: "large" | "compact") => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(200, "easeInEaseOut", "opacity"),
    );
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

  // Reload data whenever this screen comes back into focus (includes first mount).
  useFocusEffect(
    useCallback(() => {
      loadStatusOptions();
      loadFriendsStatus().catch(() => {
        toast.show({
          type: "error",
          text1: "Failed to load friends. Check your connection.",
        });
      });
      loadCurrentStatus().catch(() => {});
      loadConnections();
    }, []),
  );

  // Refresh when app comes back from background
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === "active") {
        loadFriendsStatus().catch(() => {});
        loadCurrentStatus().catch(() => {});
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, []);

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
      const friend = friendsStatus.find(
        (f) => f.user_id === pendingFriendIdRef.current,
      );
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
    } catch {}
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

  const openMyStatusDetail = () => {
    if (!displayMyStatus?.option) return;
    setSelectedFriend({
      ...displayMyStatus,
      first_name: user?.first_name ?? displayMyStatus.first_name,
      last_name: user?.last_name ?? displayMyStatus.last_name,
    });
    setFriendModalVisible(true);
  };

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
      toast.show({
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
      await connectionsService.updateVisibility(
        selectedFriend.user_id,
        newShowsStatus,
      );
      await Promise.all([loadConnections(), loadFriendsStatus()]);
    } catch (error: any) {
      toast.show({ type: "error", text1: "Failed to update. Try again." });
    } finally {
      setTogglingVisibility(false);
    }
  };

  const handleRemoveFriend = () => {
    if (!selectedFriend) return;
    const name = getDisplayName(
      selectedFriend.first_name,
      selectedFriend.last_name,
    );
    Alert.alert("Remove Friend", `Are you sure you want to remove ${name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await connectionsService.deleteConnection(selectedFriend.user_id);
            closeFriendModal();
            await Promise.all([loadFriendsStatus(), loadConnections()]);
            toast.show({ type: "success", text1: `${name} removed.` });
          } catch (error: any) {
            toast.show({
              type: "error",
              text1: "Failed to remove. Try again.",
            });
          }
        },
      },
    ]);
  };

  const loadFriendsStatus = async () => {
    const statuses = await statusService.getFriendsStatus();
    setFriendsStatus(statuses);
    // Best-effort — widget storage failure should not surface as a "failed to load friends" error
    widgetStorageService.saveAllFriendStatuses(statuses).catch(() => {});
  };

  const handleStatusButtonPress = async (option: StatusOption) => {
    if (option.user_id !== null && !isPremium && option.id !== currentOptionId) {
      try {
        const success = await presentPaywall();
        if (success) await refreshUser();
      } catch (error: any) {
        toast.show({
          type: "error",
          text1: error.message || "Failed to open subscription options.",
        });
      }
      return;
    }
    setSelectedOption(option);
    setModalVisible(true);
  };

  const handleStatusConfirm = async (
    optionId: string,
    note?: string,
    expiresAt?: Date,
  ) => {
    setLoading(true);
    try {
      const updatedStatus = await statusService.updateStatus(
        optionId,
        note,
        expiresAt,
      );
      setMyStatus(updatedStatus);
      setModalVisible(false);
      setSelectedOption(null);
    } catch (error: any) {
      Sentry.captureException(error);
      toast.show({
        type: "error",
        text1: error.message || "Check your connection and try again.",
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const getDisplayName = (
    firstName: string | null,
    lastName: string | null,
  ) => {
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    }
    return firstName || lastName || "User";
  };

  const getDetailModalDisplayName = (friend: Status) => {
    if (user?.id && friend.user_id === user.id) {
      return getDisplayName(user.first_name, user.last_name);
    }
    return getDisplayName(friend.first_name, friend.last_name);
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
          expirationDate,
        )} ${timeFormatter.format(expirationDate)}`;
      }
    } catch (error) {
      Sentry.captureException(error);
      return null;
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.canvas.background }]}
      edges={["top"]}
    >
      {/* Refresh Hint Banner */}
      {showRefreshHint && (
        <Animated.View
          style={[
            styles.refreshHintBanner,
            { backgroundColor: colors.tint.mint },
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.refreshHintContent}>
            <Ionicons name="arrow-down" size={20} color={colors.interaction.primary} />
            <Text variant="primary" style={styles.refreshHintText}>Pull down to refresh</Text>
          </View>
          <TouchableOpacity onPress={dismissRefreshHint} style={styles.refreshHintClose} accessibilityLabel="Dismiss" accessibilityRole="button">
            <Ionicons name="close" size={20} color={colors.text.secondary} />
          </TouchableOpacity>
        </Animated.View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Spacing.md + (showRefreshHint ? 56 : 0),
          },
        ]}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={true}
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
        {/* Greeting Header */}
        <View style={[styles.greetingContainer, { paddingHorizontal: horizontalPadding }]}>
          <View>
            <Text variant="secondary" style={styles.greetingText}>{getGreeting()},</Text>
            <Text variant="primary" style={styles.greetingName}>{userName}</Text>
          </View>
          <TouchableOpacity
            style={styles.manageButton}
            onPress={handleManageStatusPress}
            disabled={premiumLoading}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Manage statuses"
            accessibilityRole="button"
          >
            {premiumLoading ? (
              <ActivityIndicator size="small" color={colors.interaction.primary} />
            ) : isPremium ? (
              <Ionicons name="settings-outline" size={22} color={colors.text.secondary} />
            ) : (
              <View style={styles.premiumBadge}>
                <Ionicons name="diamond-outline" size={14} color={colors.interaction.accent} />
                <Text style={[styles.premiumBadgeText, { color: colors.interaction.accent }]}>PRO</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Active Status Hero */}
        <View style={{ paddingHorizontal: horizontalPadding }}>
          {displayMyStatus?.option ? (
            <TouchableOpacity
              style={[
                styles.heroCard,
                { backgroundColor: displayMyStatus.option.color + "12" },
              ]}
              onPress={openMyStatusDetail}
              activeOpacity={0.8}
            >
              <View
                style={[styles.heroAccent, { backgroundColor: displayMyStatus.option.color }]}
              />
              <View style={styles.heroEmojiBox}>
                <Text style={styles.heroEmoji}>{displayMyStatus.option.emoji}</Text>
              </View>
              <View style={styles.heroTextBlock}>
                <Text variant="primary" style={styles.heroLabel} numberOfLines={1}>
                  {displayMyStatus.option.label}
                </Text>
                {displayMyStatus.note && (
                  <Text variant="secondary" style={styles.heroNote} numberOfLines={1}>
                    {displayMyStatus.note}
                  </Text>
                )}
              </View>
              {displayMyStatus.expires_at &&
                formatExpirationTime(displayMyStatus.expires_at) && (
                  <View style={styles.heroExpiryRow}>
                    <Ionicons name="time-outline" size={11} color={isDark ? "#F59E0B" : "#B45309"} />
                    <Text style={[styles.heroExpiryText, { color: isDark ? "#F59E0B" : "#B45309" }]}>
                      {formatExpirationTime(displayMyStatus.expires_at)}
                    </Text>
                  </View>
                )}
            </TouchableOpacity>
          ) : (
            <View style={[styles.heroCardEmpty, { backgroundColor: colors.canvas.card }]}>
              <Text style={styles.heroEmptyEmoji}>👋</Text>
              <View style={styles.heroEmptyTextBlock}>
                <Text variant="primary" style={styles.heroEmptyTitle}>
                  What are you up to?
                </Text>
                <Text variant="secondary" style={styles.heroEmptyText}>
                  Pick a status below
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Status Picker — Horizontal Scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.statusScroll}
          contentContainerStyle={[
            styles.statusScrollContent,
            { paddingHorizontal: horizontalPadding },
          ]}
        >
          {displayStatusOptions.map((option) => {
            const isActive = currentOptionId === option.id;
            const isCustom = option.user_id !== null;
            const isLocked = isCustom && !isPremium;
            return (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.statusPill,
                  { backgroundColor: colors.canvas.card },
                  isLocked && { opacity: 0.5 },
                  isActive && { backgroundColor: option.color, opacity: 1 },
                ]}
                onPress={() => handleStatusButtonPress(option)}
                disabled={loading}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={styles.statusPillEmoji}>{option.emoji}</Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.statusPillLabel,
                    { color: colors.text.primary },
                    isActive && { color: "#FFFFFF" },
                  ]}
                >
                  {option.label}
                </Text>
                {isLocked && (
                  <Ionicons name="diamond" size={10} color={colors.interaction.accent} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Friends Section */}
        <View style={[styles.friendsSection, { paddingHorizontal: horizontalPadding }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>FRIENDS</Text>
              {displayFriendsStatus.length > 0 && (
                <View style={[styles.friendCountBadge, { backgroundColor: colors.canvas.card }]}>
                  <Text style={[styles.friendCountText, { color: colors.text.secondary }]}>
                    {displayFriendsStatus.length}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.headerRight}>
              {displayFriendsStatus.length > 0 && (
                <View
                  style={[
                    styles.layoutToggle,
                    { backgroundColor: colors.canvas.card, borderColor: colors.text.secondary + "40" },
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.layoutToggleButton,
                      friendLayoutMode === "large" && styles.layoutToggleButtonActive,
                    ]}
                    onPress={() => setFriendLayoutModeAndPersist("large")}
                    activeOpacity={0.8}
                    accessibilityLabel="Large view"
                    accessibilityRole="button"
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
                    accessibilityLabel="Compact view"
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name="grid"
                      size={14}
                      color={friendLayoutMode === "compact" ? "#FFFFFF" : colors.text.secondary}
                    />
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity
                style={styles.connectButton}
                onPress={() => (navigation.getParent() as any)?.navigate("Connect")}
                activeOpacity={0.7}
              >
                <Ionicons name="person-add" size={16} color={colors.interaction.primary} />
                <Text style={styles.connectButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>

          {refreshing && displayFriendsStatus.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.interaction.primary} />
            </View>
          ) : displayFriendsStatus.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconCircle, { backgroundColor: colors.canvas.subtle }]}>
                <Ionicons name="people-outline" size={fs(32)} color={colors.text.secondary} />
              </View>
              <Text variant="primary" style={styles.emptyTitle}>No friends yet</Text>
              <Text variant="secondary" style={styles.emptyText}>
                Add friends to see their status
              </Text>
              <Button
                variant="primary"
                onPress={() => (navigation.getParent() as any)?.navigate("Connect")}
                style={styles.emptyConnectButton}
              >
                Add Friends
              </Button>
            </View>
          ) : friendLayoutMode === "compact" ? (
            <View style={styles.friendsGrid}>
              {displayFriendsStatus.map((status) => {
                const firstName = status.first_name || "User";
                return (
                  <TouchableOpacity
                    key={status.user_id}
                    style={[
                      styles.friendCardCompact,
                      { backgroundColor: colors.canvas.card },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => { setSelectedFriend(status); setFriendModalVisible(true); }}
                  >
                    <View
                      style={[
                        styles.compactEmojiCircle,
                        { backgroundColor: (status.option?.color || Colors.interaction.primary) + "18" },
                      ]}
                    >
                      <Text style={styles.compactEmoji}>{status.option?.emoji || "🟢"}</Text>
                    </View>
                    <View style={styles.friendNameCompactRow}>
                      <Text
                        variant="primary"
                        style={styles.friendNameCompact}
                        numberOfLines={1}
                      >
                        {firstName}
                      </Text>
                      {getConnectionForFriend(status.user_id)?.user_shows_status === false && (
                        <Ionicons
                          name="eye-off-outline"
                          size={12}
                          color={colors.text.secondary}
                          style={styles.friendNameCompactHiddenIcon}
                        />
                      )}
                    </View>
                    <Text variant="secondary" style={styles.friendStatusCompact} numberOfLines={1}>
                      {status.option?.label || "Available"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.friendsList}>
              {displayFriendsStatus.map((status) => {
                const displayName = getDisplayName(status.first_name, status.last_name);
                return (
                  <TouchableOpacity
                    key={status.user_id}
                    style={[styles.friendCard, { backgroundColor: colors.canvas.card }]}
                    activeOpacity={0.7}
                    onPress={() => { setSelectedFriend(status); setFriendModalVisible(true); }}
                  >
                    <Text style={styles.friendEmoji}>{status.option?.emoji || "🟢"}</Text>
                    <View style={styles.friendInfo}>
                      <View style={styles.friendRow}>
                        <Text
                          variant="primary"
                          style={[styles.friendName, { fontSize: fs(15) }]}
                          numberOfLines={1}
                        >
                          {displayName}
                        </Text>
                        {getConnectionForFriend(status.user_id)?.user_shows_status === false && (
                          <Ionicons name="eye-off-outline" size={13} color={colors.text.secondary} />
                        )}
                        {status.expires_at && formatExpirationTime(status.expires_at) && (
                          <Text style={[styles.friendExpiryText, { color: isDark ? "#F59E0B" : "#B45309" }]}>
                            {formatExpirationTime(status.expires_at)}
                          </Text>
                        )}
                      </View>
                      <View style={styles.friendBottomRow}>
                        <Text variant="secondary" style={styles.friendStatusLabel} numberOfLines={1}>
                          {status.option?.label || "Available"}
                        </Text>
                        {status.note && (
                          <>
                            <Text variant="secondary" style={styles.friendDotSep}>·</Text>
                            <Text variant="secondary" style={styles.friendNoteText} numberOfLines={1}>
                              {status.note}
                            </Text>
                          </>
                        )}
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
        animationType="slide"
        onRequestClose={closeFriendModal}
      >
        <TouchableWithoutFeedback onPress={closeFriendModal}>
          <View style={styles.friendModalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View
                style={[
                  styles.friendModalContent,
                  { backgroundColor: colors.canvas.background },
                ]}
              >
                {selectedFriend && (
                  <>
                    {/* Colored banner header */}
                    <View
                      style={[
                        styles.friendModalBanner,
                        {
                          backgroundColor:
                            (selectedFriend.option?.color ||
                              Colors.interaction.primary) + "18",
                        },
                        !selectedFriend.note &&
                          !getConnectionForFriend(selectedFriend.user_id) && {
                            paddingBottom: Spacing.xxl + Spacing.md,
                          },
                      ]}
                    >
                      <View style={styles.friendModalBannerTop}>
                        <Text style={styles.friendModalBannerEmoji}>
                          {selectedFriend.option?.emoji || "🟢"}
                        </Text>
                        <TouchableOpacity
                          onPress={closeFriendModal}
                          style={styles.friendModalCloseButton}
                          accessibilityLabel="Close"
                          accessibilityRole="button"
                        >
                          <Ionicons
                            name="close"
                            size={22}
                            color={colors.text.secondary}
                          />
                        </TouchableOpacity>
                      </View>
                      <Text
                        variant="primary"
                        style={styles.friendModalTitle}
                        numberOfLines={1}
                      >
                        {getDetailModalDisplayName(selectedFriend)}
                      </Text>
                      <View style={styles.friendModalStatusRow}>
                        <Text
                          variant="secondary"
                          style={styles.friendModalStatusLabel}
                        >
                          {selectedFriend.option?.label || "Available"}
                        </Text>
                        {selectedFriend.expires_at &&
                          formatExpirationTime(selectedFriend.expires_at) && (
                            <View style={styles.friendModalExpiryRow}>
                              <Ionicons
                                name="time-outline"
                                size={12}
                                color="#F59E0B"
                              />
                              <Text style={styles.friendModalExpiryText}>
                                {formatExpirationTime(
                                  selectedFriend.expires_at,
                                )}
                              </Text>
                            </View>
                          )}
                      </View>
                    </View>

                    {/* Note card */}
                    {selectedFriend.note && (
                      <View style={styles.friendModalBody}>
                        <View
                          style={[
                            styles.friendModalNoteCard,
                            { backgroundColor: colors.canvas.card },
                          ]}
                        >
                          <Ionicons
                            name="chatbubble-outline"
                            size={14}
                            color={colors.text.secondary}
                          />
                          <Text
                            variant="primary"
                            style={styles.friendModalNote}
                          >
                            {selectedFriend.note}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Manage Actions (friends only — no connection to self) */}
                    {user?.id !== selectedFriend.user_id &&
                      getConnectionForFriend(selectedFriend.user_id) && (
                      <View style={styles.friendModalActions}>
                        {!getConnectionForFriend(selectedFriend.user_id)
                          ?.user_shows_status && (
                          <View
                            style={[
                              styles.friendModalHiddenNoteBox,
                              { backgroundColor: colors.canvas.card },
                            ]}
                          >
                            <Ionicons
                              name="eye-off-outline"
                              size={13}
                              color={colors.text.secondary}
                            />
                            <Text
                              variant="secondary"
                              style={styles.friendModalHiddenNote}
                            >
                              You've hidden your status from them, so neither of
                              you sees the other's real status.
                            </Text>
                          </View>
                        )}
                        <TouchableOpacity
                          style={[
                            styles.friendModalActionRow,
                            { backgroundColor: colors.canvas.card },
                          ]}
                          onPress={handleToggleVisibility}
                          disabled={togglingVisibility}
                          activeOpacity={0.7}
                        >
                          {togglingVisibility ? (
                            <ActivityIndicator
                              size="small"
                              color={colors.text.secondary}
                            />
                          ) : (
                            <>
                              <Ionicons
                                name={
                                  getConnectionForFriend(
                                    selectedFriend.user_id,
                                  )?.user_shows_status
                                    ? "eye-off-outline"
                                    : "eye-outline"
                                }
                                size={18}
                                color={colors.text.secondary}
                              />
                              <Text
                                variant="primary"
                                style={styles.friendModalActionText}
                              >
                                {getConnectionForFriend(
                                  selectedFriend.user_id,
                                )?.user_shows_status
                                  ? "Hide my status"
                                  : "Show my status"}
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.friendModalActionRow,
                            { backgroundColor: colors.canvas.card },
                          ]}
                          onPress={handleRemoveFriend}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name="person-remove-outline"
                            size={18}
                            color={Colors.interaction.error}
                          />
                          <Text
                            variant="primary"
                            style={styles.friendModalRemoveText}
                          >
                            Remove friend
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.friendModalActionRow,
                            { backgroundColor: colors.canvas.card },
                          ]}
                          onPress={() => setReportSheetVisible(true)}
                          activeOpacity={0.7}
                          accessibilityLabel={`Report ${getDetailModalDisplayName(selectedFriend)}`}
                          accessibilityRole="button"
                        >
                          <Ionicons
                            name="flag-outline"
                            size={18}
                            color={colors.text.secondary}
                          />
                          <Text
                            variant="primary"
                            style={styles.friendModalActionText}
                          >
                            Report user
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Report Sheet — shown from friend detail modal */}
      <ReportSheet
        visible={reportSheetVisible}
        onClose={() => setReportSheetVisible(false)}
        reportedUserId={selectedFriend?.user_id}
        reportedUserName={
          selectedFriend ? getDetailModalDisplayName(selectedFriend) : undefined
        }
      />
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
    paddingBottom: Spacing.xl,
  },

  // ── Greeting ──
  greetingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  greetingText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
  },
  greetingName: {
    fontSize: 26,
    fontFamily: Typography.fontFamily.semiBold,
    marginTop: 2,
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

  // ── Hero Card ──
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Borders.radius.medium,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingLeft: Spacing.md + 4,
    marginBottom: Spacing.sm,
    overflow: "hidden",
    gap: Spacing.md,
  },
  heroAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderRadius: 2,
  },
  heroEmojiBox: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  heroEmoji: {
    fontSize: 28,
    lineHeight: 34,
  },
  heroTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  heroLabel: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
    flexShrink: 1,
  },
  heroNote: {
    fontSize: 13,
    fontStyle: "italic",
  },
  heroExpiryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  heroExpiryText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    color: "#F59E0B",
  },
  heroCardEmpty: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Borders.radius.medium,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  heroEmptyEmoji: {
    fontSize: 28,
    lineHeight: 34,
  },
  heroEmptyTextBlock: {
    flex: 1,
    gap: 2,
  },
  heroEmptyTitle: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
  },
  heroEmptyText: {
    fontSize: 13,
  },

  // ── Status Picker ──
  statusScroll: {
    marginTop: Spacing.xs,
  },
  statusScrollContent: {
    gap: Spacing.sm,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  statusPillEmoji: {
    fontSize: 14,
  },
  statusPillLabel: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
  },

  // ── Friends Section ──
  friendsSection: {
    marginTop: Spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semiBold,
    letterSpacing: 0.8,
  },
  friendCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 100,
  },
  friendCountText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexShrink: 0,
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

  // ── Large Friend Cards ──
  friendsList: {
    gap: Spacing.sm,
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Borders.radius.medium,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm + 2,
  },
  friendEmoji: {
    fontSize: 22,
    lineHeight: 28,
  },
  friendInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  friendName: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.semiBold,
    flexShrink: 1,
  },
  friendBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  friendStatusLabel: {
    fontSize: 13,
    flexShrink: 0,
  },
  friendDotSep: {
    fontSize: 13,
    marginHorizontal: 6,
  },
  friendNoteText: {
    fontSize: 13,
    fontStyle: "italic",
    flex: 1,
    minWidth: 0,
  },
  friendExpiryText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    color: "#B45309",
    marginLeft: "auto",
    flexShrink: 0,
  },

  // ── Compact Friend Cards ──
  friendsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  friendCardCompact: {
    borderRadius: Borders.radius.medium,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm + 2,
    paddingTop: Spacing.md,
    alignItems: "center",
    width: "31%",
  },
  compactEmojiCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  compactEmoji: {
    fontSize: 22,
    lineHeight: 28,
  },
  friendNameCompactRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    maxWidth: "100%",
    marginBottom: 2,
    gap: 2,
  },
  friendNameCompact: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semiBold,
    textAlign: "center",
    flexShrink: 1,
  },
  friendNameCompactHiddenIcon: {
    flexShrink: 0,
  },
  friendStatusCompact: {
    fontSize: 11,
    textAlign: "center",
  },

  friendModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "flex-end",
  },
  friendModalContent: {
    borderTopLeftRadius: Borders.radius.large,
    borderTopRightRadius: Borders.radius.large,
    width: "100%",
    maxHeight: "80%",
    overflow: "hidden",
  },
  friendModalBanner: {
    paddingTop: Spacing.lg + Spacing.sm,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  friendModalBannerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  friendModalBannerEmoji: {
    fontSize: 36,
    lineHeight: 44,
  },
  friendModalCloseButton: {
    padding: Spacing.xs,
  },
  friendModalTitle: {
    fontSize: 22,
    fontFamily: Typography.fontFamily.semiBold,
    marginBottom: 4,
  },
  friendModalStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  friendModalStatusLabel: {
    fontSize: 14,
  },
  friendModalBody: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl + Spacing.md,
    gap: Spacing.sm,
  },
  friendModalNoteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    borderRadius: Borders.radius.small,
    padding: Spacing.md,
  },
  friendModalNote: {
    lineHeight: 22,
    flex: 1,
  },
  friendModalExpiryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  friendModalExpiryText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    color: "#F59E0B",
  },
  friendModalActions: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl + Spacing.md,
    gap: Spacing.sm,
  },
  friendModalHiddenNoteBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: Borders.radius.small,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  friendModalHiddenNote: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  friendModalActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: Borders.radius.small,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  friendModalActionText: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.medium,
  },
  friendModalRemoveText: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.interaction.error,
  },
});

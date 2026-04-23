import React, { useState, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
  ActivityIndicator,
  Linking,
  AppState,
  Modal,
  Platform,
  Keyboard,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { messagingService } from "../services/messaging.service";
import { widgetStorageService } from "../services/widget-storage.service";
import { useAuth } from "../contexts/AuthContext";
import { userService } from "../services/user.service";
import { authService } from "../services/auth.service";
import { deviceTokenService } from "../services/device-token.service";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import {
  presentPaywall,
} from "../services/purchases.service";
import { useIsPremium } from "../hooks/useIsPremium";
import { toast } from "../utils/toast";
import Sentry from "../../sentry";
import { Colors, Borders, Spacing, Typography, SAFE_AREA_BOTTOM, useResponsive, useColors, useTheme } from "../design";
import type { ThemeMode } from "../design";
import { Text } from "../components/primitives/Text";
import { Button } from "../components/actions/Button";
import { TextInput as DesignTextInput } from "../components/inputs/TextInput";

type ProfileScreenNavigationProp =
  NativeStackNavigationProp<RootStackParamList>;

const PROFILE_NAME_MAX_LENGTH = 50;

function clampProfileName(value: string | null | undefined): string {
  return (value || "").slice(0, PROFILE_NAME_MAX_LENGTH);
}

export default function ProfileScreen() {
  const { user, logout, deleteAccount, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const { horizontalPadding, fs } = useResponsive();
  const colors = useColors();
  const { themeMode, setThemeMode } = useTheme();
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const notifCheckTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    isPremium,
    loading: premiumLoading,
    willRenew,
    expirationDate,
  } = useIsPremium();
  const [firstName, setFirstName] = useState(() => clampProfileName(user?.first_name));
  const [lastName, setLastName] = useState(() => clampProfileName(user?.last_name));
  const [pushNotifications, setPushNotifications] = useState(false);
  const [editingFirstName, setEditingFirstName] = useState(false);
  const [editingLastName, setEditingLastName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [authProvider, setAuthProvider] = useState<string | null>(null);
  const [changePasswordModalVisible, setChangePasswordModalVisible] =
    useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changePasswordError, setChangePasswordError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [openingPaywall, setOpeningPaywall] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const [changePasswordKeyboardLift, setChangePasswordKeyboardLift] = useState(0);

  useEffect(() => {
    if (!changePasswordModalVisible) {
      setChangePasswordKeyboardLift(0);
      return;
    }
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (e: { endCoordinates: { height: number } }) => {
      const h = e.endCoordinates.height;
      // Full keyboard height often over-lifts bottom sheets. Subtract a soften amount that
      // scales with screen size; users can still scroll the sheet if a field is tight.
      const soften = Math.min(100, Math.max(44, Math.round(windowHeight * 0.06)));
      setChangePasswordKeyboardLift(Math.max(0, h - soften));
    };
    const onHide = () => setChangePasswordKeyboardLift(0);
    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [changePasswordModalVisible, windowHeight]);

  useEffect(() => {
    checkNotificationState();
    checkAuthProvider();
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        checkNotificationState();
        checkAuthProvider();
      }
    });
    return () => {
      subscription.remove();
      if (notifCheckTimerRef.current) clearTimeout(notifCheckTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (user) {
      setFirstName(clampProfileName(user.first_name));
      setLastName(clampProfileName(user.last_name));
    }
  }, [user]);

  const checkAuthProvider = () => {
    setAuthProvider(authService.getAuthProvider());
  };

  const checkNotificationState = async () => {
    try {
      const hasPermission = await messagingService.hasPermission();
      setPushNotifications(hasPermission);
    } catch (error) {
      Sentry.captureException(error);
    }
  };

  const openNotificationSettings = async () => {
    if (Platform.OS === "android") {
      const packageName =
        Constants.expoConfig?.android?.package ||
        "com.arda.instantstatusapp";
      try {
        const intentUri = `intent:#Intent;action=android.settings.APP_NOTIFICATION_SETTINGS;data=package:${packageName};end`;
        const canOpen = await Linking.canOpenURL(intentUri);
        if (canOpen) {
          await Linking.openURL(intentUri);
        } else {
          await Linking.openURL(`package:${packageName}`);
        }
      } catch {
        try {
          await Linking.openSettings();
        } catch {
        }
      }
    } else {
      await Linking.openSettings();
    }
  };

  const handleSaveFirstName = async () => {
    if (!firstName.trim()) {
      toast.show({ type: "error", text1: "First name cannot be empty" });
      setFirstName(clampProfileName(user?.first_name));
      setEditingFirstName(false);
      return;
    }
    if (firstName.trim().length > PROFILE_NAME_MAX_LENGTH) {
      toast.show({
        type: "error",
        text1: `First name must be ${PROFILE_NAME_MAX_LENGTH} characters or less`,
      });
      return;
    }
    setSaving(true);
    try {
      await userService.updateMe({ first_name: firstName.trim() });
      await refreshUser();
      setEditingFirstName(false);
    } catch (error: any) {
      toast.show({ type: "error", text1: error.message || "Failed to update" });
      setFirstName(clampProfileName(user?.first_name));
      setEditingFirstName(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLastName = async () => {
    if (!lastName.trim()) {
      toast.show({ type: "error", text1: "Last name cannot be empty" });
      setLastName(clampProfileName(user?.last_name));
      setEditingLastName(false);
      return;
    }
    if (lastName.trim().length > PROFILE_NAME_MAX_LENGTH) {
      toast.show({
        type: "error",
        text1: `Last name must be ${PROFILE_NAME_MAX_LENGTH} characters or less`,
      });
      return;
    }
    setSaving(true);
    try {
      await userService.updateMe({ last_name: lastName.trim() });
      await refreshUser();
      setEditingLastName(false);
    } catch (error: any) {
      toast.show({ type: "error", text1: error.message || "Failed to update" });
      setLastName(clampProfileName(user?.last_name));
      setEditingLastName(false);
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePushNotifications = async (value: boolean) => {
    try {
      const hasPermission = await messagingService.hasPermission();
      if (value) {
        if (!hasPermission) {
          const granted = await messagingService.requestPermission();
          if (granted) {
            const token = await messagingService.getTokenForRegistration();
            if (token && user) await deviceTokenService.registerToken(token);
            setPushNotifications(true);
          } else {
            Alert.alert(
              "Permission Required",
              "Enable notifications in settings to keep your widget updated.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Open Settings",
                  onPress: async () => {
                    await openNotificationSettings();
                    notifCheckTimerRef.current = setTimeout(checkNotificationState, 1000);
                  },
                },
              ]
            );
            setPushNotifications(false);
          }
        } else {
          const token = await messagingService.getTokenForRegistration();
          if (token && user) await deviceTokenService.registerToken(token);
          setPushNotifications(true);
        }
      } else {
        Alert.alert(
          "Disable Notifications",
          "To disable, turn off notifications in your device settings.",
          [
            { text: "Cancel", style: "cancel", onPress: () => setPushNotifications(true) },
            {
              text: "Open Settings",
              onPress: async () => {
                await openNotificationSettings();
                notifCheckTimerRef.current = setTimeout(checkNotificationState, 1000);
              },
            },
          ]
        );
        setPushNotifications(false);
      }
    } catch (error: any) {
      toast.show({ type: "error", text1: error.message || "Failed to update" });
    }
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
          } catch (error: any) {
            toast.show({ type: "error", text1: error.message || "Failed to logout" });
          }
        },
      },
    ]);
  };

  const handleChangePassword = () => {
    setChangePasswordModalVisible(true);
    setChangePasswordError("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleSavePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setChangePasswordError("Please fill in all fields");
      return;
    }
    if (newPassword.length < 8) {
      setChangePasswordError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setChangePasswordError("Passwords do not match");
      return;
    }
    if (currentPassword === newPassword) {
      setChangePasswordError("New password must be different");
      return;
    }
    setChangePasswordError("");
    setChangingPassword(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      setChangePasswordModalVisible(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.show({ type: "success", text1: "Password updated" });
    } catch (error: any) {
      setChangePasswordError(error.message || "Failed to update password");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This cannot be undone. All your data will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => handleConfirmDeleteAccount(),
        },
      ]
    );
  };

  const handleConfirmDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await deleteAccount();
      // On success the component unmounts — no state update needed
    } catch (error: any) {
      toast.show({ type: "error", text1: error.message || "Failed to delete" });
      setDeletingAccount(false);
    }
  };

  const openPrivacyPolicy = () => {
    WebBrowser.openBrowserAsync("https://instantstatus.app/privacy");
  };

  const openTermsOfUse = () => {
    WebBrowser.openBrowserAsync("https://instantstatus.app/terms");
  };

  const handleUpgradeToPremium = async () => {
    try {
      setOpeningPaywall(true);
      const success = await presentPaywall();
      if (success) toast.show({ type: "success", text1: "Welcome to Premium!" });
    } catch (error: any) {
      toast.show({ type: "error", text1: error.message || "Please try again" });
    } finally {
      setOpeningPaywall(false);
    }
  };

  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Profile";


  return (
    <View style={[styles.container, { backgroundColor: colors.canvas.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + Spacing.lg,
            paddingHorizontal: horizontalPadding,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
      >
        {/* Profile Header */}
        <View style={styles.header}>
          <Text variant="primary" style={[styles.displayName, { fontSize: fs(24) }]}>
            {displayName}
          </Text>
          <Text variant="secondary" style={styles.email}>
            {user?.email}
          </Text>
        </View>

        {/* Profile Info */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>PROFILE</Text>
          <View style={[styles.card, { backgroundColor: colors.canvas.card }]}>
            {/* First Name */}
            {editingFirstName ? (
              <View style={styles.editingRow}>
                <Text variant="secondary" style={styles.inlineLabel}>First name</Text>
                <View style={styles.editRow}>
                  <DesignTextInput
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="First name"
                    editable={!saving}
                    maxLength={PROFILE_NAME_MAX_LENGTH}
                    style={styles.input}
                  />
                  <TouchableOpacity onPress={handleSaveFirstName} disabled={saving} style={styles.iconBtn} accessibilityLabel="Save first name" accessibilityRole="button">
                    {saving ? (
                      <ActivityIndicator size="small" color={colors.interaction.primary} />
                    ) : (
                      <Ionicons name="checkmark" size={22} color={colors.interaction.primary} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity disabled={saving} onPress={() => { setFirstName(clampProfileName(user?.first_name)); setEditingFirstName(false); }} style={styles.iconBtn} accessibilityLabel="Cancel" accessibilityRole="button">
                    <Ionicons name="close" size={22} color={colors.text.secondary} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.inlineRow} onPress={() => setEditingFirstName(true)}>
                <Text variant="secondary" style={styles.inlineLabel}>First name</Text>
                <View style={styles.inlineValueRow}>
                  <Text variant="primary">{user?.first_name || "Add"}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
                </View>
              </TouchableOpacity>
            )}
            <View style={[styles.divider, { backgroundColor: colors.text.secondary + "30" }]} />
            {/* Last Name */}
            {editingLastName ? (
              <View style={styles.editingRow}>
                <Text variant="secondary" style={styles.inlineLabel}>Last name</Text>
                <View style={styles.editRow}>
                  <DesignTextInput
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Last name"
                    editable={!saving}
                    maxLength={PROFILE_NAME_MAX_LENGTH}
                    style={styles.input}
                  />
                  <TouchableOpacity onPress={handleSaveLastName} disabled={saving} style={styles.iconBtn} accessibilityLabel="Save last name" accessibilityRole="button">
                    {saving ? (
                      <ActivityIndicator size="small" color={colors.interaction.primary} />
                    ) : (
                      <Ionicons name="checkmark" size={22} color={colors.interaction.primary} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity disabled={saving} onPress={() => { setLastName(clampProfileName(user?.last_name)); setEditingLastName(false); }} style={styles.iconBtn} accessibilityLabel="Cancel" accessibilityRole="button">
                    <Ionicons name="close" size={22} color={colors.text.secondary} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.inlineRow} onPress={() => setEditingLastName(true)}>
                <Text variant="secondary" style={styles.inlineLabel}>Last name</Text>
                <View style={styles.inlineValueRow}>
                  <Text variant="primary">{user?.last_name || "Add"}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
                </View>
              </TouchableOpacity>
            )}
            <View style={[styles.divider, { backgroundColor: colors.text.secondary + "30" }]} />
            {/* Password / Auth */}
            {authProvider === "password" ? (
              <TouchableOpacity style={styles.inlineRow} onPress={handleChangePassword}>
                <Text variant="secondary" style={styles.inlineLabel}>Password</Text>
                <View style={styles.inlineValueRow}>
                  <Text variant="primary">Change password</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.inlineRow}>
                <Text variant="secondary" style={styles.inlineLabel}>Signed in with</Text>
                <Text variant="primary">
                  {authProvider === "google.com" ? "Google" : authProvider === "apple.com" ? "Apple" : "—"}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Subscription */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>SUBSCRIPTION</Text>
          <View style={[styles.card, { backgroundColor: colors.canvas.card }]}>
            {premiumLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.interaction.primary} />
                <Text variant="secondary">Checking status…</Text>
              </View>
            ) : isPremium ? (
              <>
                <View style={styles.premiumRow}>
                  <View style={styles.premiumBadge}>
                    <Ionicons name="star" size={14} color="#FFFFFF" />
                    <Text style={[styles.premiumBadgeText, { fontSize: fs(13) }]}>Premium</Text>
                  </View>
                  {willRenew === false && expirationDate ? (
                    <Text variant="secondary" style={styles.expiryText}>
                      Expires {expirationDate.toLocaleDateString()}
                    </Text>
                  ) : (
                    <Text variant="secondary" style={styles.expiryText}>Active</Text>
                  )}
                </View>
                <View style={[styles.divider, { backgroundColor: colors.text.secondary + "30" }]} />
                <TouchableOpacity
                  style={styles.inlineRow}
                  onPress={() => navigation.navigate("SubscriptionManagement" as never)}
                >
                  <Text variant="primary">Manage subscription</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.upgradeRow}
                onPress={handleUpgradeToPremium}
                disabled={openingPaywall}
                activeOpacity={0.7}
              >
                <View style={styles.upgradePill}>
                  {openingPaywall ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="star" size={14} color="#FFFFFF" />
                  )}
                  <Text style={[styles.upgradePillText, { fontSize: fs(13) }]}>Premium</Text>
                </View>
                <View style={styles.upgradeTextCol}>
                  <Text variant="primary" style={styles.upgradeTitle}>Upgrade to Premium</Text>
                  <Text variant="secondary" style={styles.upgradeSubtitle} numberOfLines={1}>Themes, statuses & more</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>SETTINGS</Text>
          <View style={[styles.card, { backgroundColor: colors.canvas.card }]}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text variant="primary">Push notifications</Text>
                <Text variant="secondary" style={styles.settingHint}>
                  {pushNotifications
                    ? "Get status updates"
                    : "Without notifications, your home screen widget may not update in real-time."}
                </Text>
              </View>
              <Switch
                value={pushNotifications}
                onValueChange={handleTogglePushNotifications}
                trackColor={{
                  false: colors.interaction.disabled,
                  true: colors.interaction.primary,
                }}
                thumbColor={colors.canvas.background}
              />
            </View>
          </View>
        </View>

        {/* Appearance */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>APPEARANCE</Text>
          <View style={[styles.card, { backgroundColor: colors.canvas.card }]}>
            <View style={styles.themeRow}>
              {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.themePill,
                    { backgroundColor: themeMode === mode ? colors.interaction.primary : colors.canvas.subtle },
                  ]}
                  onPress={() => setThemeMode(mode)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.themePillText,
                      { color: themeMode === mode ? '#FFFFFF' : colors.text.secondary },
                    ]}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Account Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>ACCOUNT</Text>
          <View style={[styles.card, { backgroundColor: colors.canvas.card }]}>
            <TouchableOpacity style={styles.actionRow} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={20} color={colors.text.primary} />
              <Text variant="primary">Log out</Text>
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: colors.text.secondary + "30" }]} />
            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleDeleteAccount}
              disabled={deletingAccount}
            >
              <Ionicons name="trash-outline" size={20} color={colors.interaction.error} />
              <Text style={styles.dangerText}>Delete account</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* App Info */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>ABOUT</Text>
          <View style={[styles.card, { backgroundColor: colors.canvas.card }]}>
            <View style={styles.inlineRow}>
              <Text variant="secondary" style={styles.inlineLabel}>Version</Text>
              <Text variant="secondary">
                {Constants.expoConfig?.version || "1.0.0"}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.text.secondary + "30" }]} />
            <TouchableOpacity style={styles.inlineRow} onPress={openPrivacyPolicy}>
              <Text variant="primary">Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: colors.text.secondary + "30" }]} />
            <TouchableOpacity style={styles.inlineRow} onPress={openTermsOfUse}>
              <Text variant="primary">Terms of Use</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
        </View>

        {__DEV__ && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>DEVELOPER</Text>
            <View style={[styles.card, { backgroundColor: colors.canvas.card }]}>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={async () => {
                  try {
                    await widgetStorageService.seedMockFriendsForWidgetTesting(8);
                    toast.show({ type: "success", text1: "Seeded 8 mock friends (marketing presets)" });
                  } catch (e) {
                    toast.show({ type: "error", text1: "Failed to seed mock friends" });
                  }
                }}
              >
                <Text variant="primary">Seed 8 mock friends (widget / screenshots)</Text>
              </TouchableOpacity>
              <View style={[styles.divider, { backgroundColor: colors.text.secondary + "30" }]} />
              <TouchableOpacity
                style={styles.actionRow}
                onPress={async () => {
                  try {
                    await widgetStorageService.seedMockFriendsForWidgetTesting(24);
                    toast.show({ type: "success", text1: "Seeded 24 mock friends (layout stress)" });
                  } catch (e) {
                    toast.show({ type: "error", text1: "Failed to seed mock friends" });
                  }
                }}
              >
                <Text variant="primary">Seed 24 mock friends (layout stress)</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>

      {/* Change Password Modal */}
      <Modal
        visible={changePasswordModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setChangePasswordModalVisible(false);
          setChangePasswordError("");
        }}
      >
        <View
          style={[
            styles.modalOverlay,
            { paddingBottom: changePasswordKeyboardLift },
          ]}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.canvas.background, paddingBottom: SAFE_AREA_BOTTOM + insets.bottom }]}>
            <View style={styles.modalHeader}>
              <Text variant="primary" style={[styles.modalTitle, { fontSize: fs(18) }]}>
                Change password
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setChangePasswordModalVisible(false);
                  setChangePasswordError("");
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                disabled={changingPassword}
                accessibilityLabel="Close"
                accessibilityRole="button"
              >
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="interactive"
            >
              {!!changePasswordError && (
                <Text
                  variant="hint"
                  style={[styles.modalInlineError, { color: colors.interaction.error }]}
                >
                  {changePasswordError}
                </Text>
              )}
              <View style={styles.modalField}>
                <Text variant="secondary" style={styles.modalLabel}>
                  Current password
                </Text>
                <DesignTextInput
                  value={currentPassword}
                  onChangeText={(t) => {
                    setChangePasswordError("");
                    setCurrentPassword(t);
                  }}
                  placeholder="Current password"
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!changingPassword}
                />
              </View>
              <View style={styles.modalField}>
                <Text variant="secondary" style={styles.modalLabel}>
                  New password
                </Text>
                <DesignTextInput
                  value={newPassword}
                  onChangeText={(t) => {
                    setChangePasswordError("");
                    setNewPassword(t);
                  }}
                  placeholder="Min 8 characters"
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!changingPassword}
                />
              </View>
              <View style={styles.modalField}>
                <Text variant="secondary" style={styles.modalLabel}>
                  Confirm password
                </Text>
                <DesignTextInput
                  value={confirmPassword}
                  onChangeText={(t) => {
                    setChangePasswordError("");
                    setConfirmPassword(t);
                  }}
                  placeholder="Confirm new password"
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!changingPassword}
                />
              </View>
              <Button
                variant="primary"
                onPress={handleSavePassword}
                loading={changingPassword}
                disabled={changingPassword}
              >
                Update password
              </Button>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.md,
  },
  header: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  displayName: {
    fontSize: 24,
    fontFamily: Typography.fontFamily.semiBold,
    marginBottom: 2,
  },
  email: {
    fontSize: 14,
  },
  section: {
    marginTop: Spacing.md,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    letterSpacing: 0.8,
    marginBottom: Spacing.xs + 2,
  },
  card: {
    borderRadius: Borders.radius.medium,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingVertical: Spacing.xs,
  },
  inlineLabel: {
    fontSize: 15,
    flex: 1,
  },
  inlineValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  editingRow: {
    paddingVertical: Spacing.sm,
  },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  input: {
    flex: 1,
    minWidth: 0,
  },
  iconBtn: {
    padding: Spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  premiumRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
  },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.interaction.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  premiumBadgeText: {
    fontFamily: Typography.fontFamily.semiBold,
    color: "#FFFFFF",
  },
  expiryText: {
    fontSize: 13,
  },
  upgradeRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  upgradePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.interaction.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  upgradePillText: {
    fontFamily: Typography.fontFamily.semiBold,
    color: "#FFFFFF",
  },
  upgradeTextCol: {
    flex: 1,
  },
  upgradeTitle: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.medium,
  },
  upgradeSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingVertical: Spacing.xs,
  },
  settingInfo: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  settingHint: {
    fontSize: 12,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    minHeight: 48,
    paddingVertical: Spacing.xs,
  },
  dangerText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.interaction.error,
  },
  themeRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  themePill: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: Borders.radius.medium,
    alignItems: "center",
  },
  themePillText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: Borders.radius.large,
    borderTopRightRadius: Borders.radius.large,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.semiBold,
  },
  modalBody: {
    maxHeight: 400,
  },
  modalBodyContent: {
    flexGrow: 1,
    paddingBottom: Spacing.lg,
  },
  modalField: {
    marginBottom: Spacing.md,
  },
  modalLabel: {
    fontSize: 13,
    marginBottom: Spacing.xs,
  },
  modalInlineError: {
    marginBottom: Spacing.sm,
    lineHeight: 20,
  },
});

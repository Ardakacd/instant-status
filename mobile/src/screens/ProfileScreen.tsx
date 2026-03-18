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
import Toast from "react-native-toast-message";
import Sentry from "../../sentry";

import { Colors, Borders, Spacing, Typography, SAFE_AREA_BOTTOM, useResponsive } from "../design";
import { Text } from "../components/primitives/Text";
import { Button } from "../components/actions/Button";
import { TextInput as DesignTextInput } from "../components/inputs/TextInput";

type ProfileScreenNavigationProp =
  NativeStackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const { user, logout, deleteAccount, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const { horizontalPadding, fs } = useResponsive();
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const {
    isPremium,
    loading: premiumLoading,
    willRenew,
    expirationDate,
  } = useIsPremium();
  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [lastName, setLastName] = useState(user?.last_name || "");
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
  const [changingPassword, setChangingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [openingPaywall, setOpeningPaywall] = useState(false);

  useEffect(() => {
    checkNotificationState();
    checkAuthProvider();
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        checkNotificationState();
        checkAuthProvider();
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || "");
      setLastName(user.last_name || "");
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
        "com.arda.instantstatus.dev";
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
      Toast.show({ type: "error", text1: "First name cannot be empty" });
      setFirstName(user?.first_name || "");
      setEditingFirstName(false);
      return;
    }
    if (firstName.trim().length > 50) {
      Toast.show({ type: "error", text1: "First name must be 50 characters or less" });
      return;
    }
    setSaving(true);
    try {
      await userService.updateMe({ first_name: firstName.trim() });
      await refreshUser();
      setEditingFirstName(false);
      Toast.show({ type: "success", text1: "First name updated" });
    } catch (error: any) {
      Toast.show({ type: "error", text1: error.message || "Failed to update" });
      setFirstName(user?.first_name || "");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLastName = async () => {
    if (!lastName.trim()) {
      Toast.show({ type: "error", text1: "Last name cannot be empty" });
      setLastName(user?.last_name || "");
      setEditingLastName(false);
      return;
    }
    if (lastName.trim().length > 50) {
      Toast.show({ type: "error", text1: "Last name must be 50 characters or less" });
      return;
    }
    setSaving(true);
    try {
      await userService.updateMe({ last_name: lastName.trim() });
      await refreshUser();
      setEditingLastName(false);
      Toast.show({ type: "success", text1: "Last name updated" });
    } catch (error: any) {
      Toast.show({ type: "error", text1: error.message || "Failed to update" });
      setLastName(user?.last_name || "");
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
            const token = await messagingService.getToken();
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
                    setTimeout(checkNotificationState, 1000);
                  },
                },
              ]
            );
            setPushNotifications(false);
          }
        } else {
          const token = await messagingService.getToken();
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
                setTimeout(checkNotificationState, 1000);
              },
            },
          ]
        );
        setPushNotifications(true);
      }
    } catch (error: any) {
      Toast.show({ type: "error", text1: error.message || "Failed to update" });
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
            Toast.show({ type: "error", text1: error.message || "Failed to logout" });
          }
        },
      },
    ]);
  };

  const handleChangePassword = () => {
    setChangePasswordModalVisible(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleSavePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Toast.show({ type: "error", text1: "Please fill in all fields" });
      return;
    }
    if (newPassword.length < 8) {
      Toast.show({ type: "error", text1: "Password must be at least 8 characters" });
      return;
    }
    if (newPassword !== confirmPassword) {
      Toast.show({ type: "error", text1: "Passwords do not match" });
      return;
    }
    if (currentPassword === newPassword) {
      Toast.show({ type: "error", text1: "New password must be different" });
      return;
    }
    setChangingPassword(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      Toast.show({ type: "success", text1: "Password updated" });
      setChangePasswordModalVisible(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      Toast.show({ type: "error", text1: error.message || "Failed to update" });
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
    } catch (error: any) {
      Toast.show({ type: "error", text1: error.message || "Failed to delete" });
    } finally {
      setDeletingAccount(false);
    }
  };

  const openPrivacyPolicy = () => {
    WebBrowser.openBrowserAsync("https://example.com/privacy-policy");
  };

  const openTermsOfUse = () => {
    WebBrowser.openBrowserAsync("https://example.com/terms-of-use");
  };

  const handleUpgradeToPremium = async () => {
    try {
      setOpeningPaywall(true);
      const success = await presentPaywall();
      if (success) Toast.show({ type: "success", text1: "Welcome to Premium!" });
    } catch (error: any) {
      Toast.show({ type: "error", text1: error.message || "Please try again" });
    } finally {
      setOpeningPaywall(false);
    }
  };

  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Profile";

  return (
    <View style={styles.container}>
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
          <Text variant="primary" style={[styles.displayName, { fontSize: fs(20) }]}>
            {displayName}
          </Text>
          <Text variant="secondary" style={styles.email}>
            {user?.email}
          </Text>
        </View>

        {/* Profile Info */}
        <View style={styles.section}>
          <Text variant="primary" style={styles.sectionTitle}>
            Profile
          </Text>
          <View style={styles.card}>
            {/* First Name */}
            <View style={styles.row}>
              <Text variant="secondary" style={styles.rowLabel}>
                First name
              </Text>
              {editingFirstName ? (
                <View style={styles.editRow}>
                  <DesignTextInput
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="First name"
                    editable={!saving}
                    style={styles.input}
                  />
                  <TouchableOpacity
                    onPress={handleSaveFirstName}
                    disabled={saving}
                    style={styles.iconBtn}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color={Colors.interaction.primary} />
                    ) : (
                      <Ionicons name="checkmark" size={22} color={Colors.interaction.primary} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setFirstName(user?.first_name || "");
                      setEditingFirstName(false);
                    }}
                    style={styles.iconBtn}
                  >
                    <Ionicons name="close" size={22} color={Colors.text.secondary} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.valueRow}
                  onPress={() => setEditingFirstName(true)}
                >
                  <Text variant="primary">{user?.first_name || "Add"}</Text>
                  <Ionicons name="chevron-forward" size={18} color={Colors.text.secondary} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.divider} />
            {/* Last Name */}
            <View style={styles.row}>
              <Text variant="secondary" style={styles.rowLabel}>
                Last name
              </Text>
              {editingLastName ? (
                <View style={styles.editRow}>
                  <DesignTextInput
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Last name"
                    editable={!saving}
                    style={styles.input}
                  />
                  <TouchableOpacity
                    onPress={handleSaveLastName}
                    disabled={saving}
                    style={styles.iconBtn}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color={Colors.interaction.primary} />
                    ) : (
                      <Ionicons name="checkmark" size={22} color={Colors.interaction.primary} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setLastName(user?.last_name || "");
                      setEditingLastName(false);
                    }}
                    style={styles.iconBtn}
                  >
                    <Ionicons name="close" size={22} color={Colors.text.secondary} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.valueRow}
                  onPress={() => setEditingLastName(true)}
                >
                  <Text variant="primary">{user?.last_name || "Add"}</Text>
                  <Ionicons name="chevron-forward" size={18} color={Colors.text.secondary} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.divider} />
            {/* Password / Auth */}
            <View style={styles.row}>
              <Text variant="secondary" style={styles.rowLabel}>
                Password
              </Text>
              {authProvider === "password" ? (
                <TouchableOpacity style={styles.valueRow} onPress={handleChangePassword}>
                  <Text variant="primary">Change password</Text>
                  <Ionicons name="chevron-forward" size={18} color={Colors.text.secondary} />
                </TouchableOpacity>
              ) : (
                <View style={styles.valueRow}>
                  <Text variant="secondary">
                    {authProvider === "google.com"
                      ? "Signed in with Google"
                      : authProvider === "apple.com"
                        ? "Signed in with Apple"
                        : "—"}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Subscription */}
        <View style={styles.section}>
          <Text variant="primary" style={styles.sectionTitle}>
            Subscription
          </Text>
          <View style={styles.card}>
            {premiumLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={Colors.interaction.primary} />
                <Text variant="secondary">Checking status…</Text>
              </View>
            ) : isPremium ? (
              <>
                <View style={styles.premiumBadge}>
                  <Ionicons name="star" size={18} color={Colors.interaction.accent} />
                  <Text style={[styles.premiumBadgeText, { fontSize: fs(16) }]}>Premium</Text>
                </View>
                {willRenew === false && expirationDate && (
                  <Text variant="secondary" style={styles.expiryText}>
                    Expires {expirationDate.toLocaleDateString()}
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.linkRow}
                  onPress={() => navigation.navigate("SubscriptionManagement" as never)}
                >
                  <Text variant="primary">Manage subscription</Text>
                  <Ionicons name="chevron-forward" size={18} color={Colors.text.secondary} />
                </TouchableOpacity>
              </>
            ) : (
              <Button
                variant="primary"
                onPress={handleUpgradeToPremium}
                loading={openingPaywall}
                disabled={openingPaywall}
                fullWidth={true}
              >
                Upgrade to Premium
              </Button>
            )}
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text variant="primary" style={styles.sectionTitle}>
            Settings
          </Text>
          <View style={styles.card}>
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
                  false: Colors.interaction.disabled,
                  true: Colors.interaction.primary,
                }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <View style={styles.card}>
            <TouchableOpacity style={styles.actionRow} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={20} color={Colors.text.primary} />
              <Text variant="primary">Log out</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleDeleteAccount}
              disabled={deletingAccount}
            >
              <Ionicons name="trash-outline" size={20} color={Colors.interaction.error} />
              <Text style={styles.dangerText}>Delete account</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* App Info */}
        <View style={styles.section}>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text variant="secondary">Version</Text>
              <Text variant="secondary">
                {Constants.expoConfig?.version || "1.0.0"}
              </Text>
            </View>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.infoRow} onPress={openPrivacyPolicy}>
              <Text variant="primary">Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.text.secondary} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.infoRow} onPress={openTermsOfUse}>
              <Text variant="primary">Terms of Use</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.text.secondary} />
            </TouchableOpacity>
          </View>
        </View>

        {__DEV__ && (
          <View style={styles.section}>
            <Text variant="primary" style={styles.sectionTitle}>
              Developer
            </Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={async () => {
                  try {
                    await widgetStorageService.seedMockFriendsForWidgetTesting(24);
                    Toast.show({ type: "success", text1: "Seeded 24 mock friends for widget" });
                  } catch (e) {
                    Toast.show({ type: "error", text1: "Failed to seed mock friends" });
                  }
                }}
              >
                <Text variant="primary">Seed 24 mock friends (widget test)</Text>
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
        onRequestClose={() => setChangePasswordModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: SAFE_AREA_BOTTOM + insets.bottom }]}>
            <View style={styles.modalHeader}>
              <Text variant="primary" style={[styles.modalTitle, { fontSize: fs(18) }]}>
                Change password
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setChangePasswordModalVisible(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                disabled={changingPassword}
              >
                <Ionicons name="close" size={24} color={Colors.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
            >
              <View style={styles.modalField}>
                <Text variant="secondary" style={styles.modalLabel}>
                  Current password
                </Text>
                <DesignTextInput
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
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
                  onChangeText={setNewPassword}
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
                  onChangeText={setConfirmPassword}
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
    backgroundColor: Colors.canvas.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.md,
  },
  header: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  displayName: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.semiBold,
    marginBottom: Spacing.xs,
  },
  email: {
    fontSize: 14,
  },
  section: {
    marginTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
    marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: "#F9FAFB",
    borderRadius: Borders.radius.medium,
    padding: Spacing.md,
  },
  row: {
    marginBottom: Spacing.sm,
  },
  rowLabel: {
    fontSize: 13,
    marginBottom: Spacing.xs,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
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
    backgroundColor: Colors.text.secondary + "40",
    marginVertical: Spacing.sm,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.xs,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  premiumBadgeText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.text.primary,
  },
  expiryText: {
    fontSize: 13,
    marginBottom: Spacing.sm,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingInfo: {
    flex: 1,
  },
  settingHint: {
    fontSize: 13,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  dangerText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.interaction.error,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.canvas.background,
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
    paddingBottom: Spacing.lg,
  },
  modalField: {
    marginBottom: Spacing.md,
  },
  modalLabel: {
    fontSize: 13,
    marginBottom: Spacing.xs,
  },
  deleteWarning: {
    marginBottom: Spacing.md,
  },
  destructiveButton: {
    backgroundColor: Colors.interaction.error,
    borderRadius: Borders.radius.medium,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  destructiveButtonText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
    color: "#FFFFFF",
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
});

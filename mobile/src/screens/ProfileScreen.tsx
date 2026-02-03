import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
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
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { messagingService } from "../services/messaging.service";
import { useAuth } from "../contexts/AuthContext";
import { userService } from "../services/user.service";
import { authService } from "../services/auth.service";
import { deviceTokenService } from "../services/device-token.service";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { presentPaywall, presentCustomerCenter } from "../services/purchases.service";
import { useIsPremium } from "../hooks/useIsPremium";
import Purchases from "react-native-purchases";
import Toast from "react-native-toast-message";

type ProfileScreenNavigationProp =
  NativeStackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const { user, logout, deleteAccount, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const { isPremium, loading: premiumLoading, willRenew, expirationDate, managementURL } = useIsPremium();
  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [lastName, setLastName] = useState(user?.last_name || "");
  const [pushNotifications, setPushNotifications] = useState(true);
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
  const [deleteAccountModalVisible, setDeleteAccountModalVisible] =
    useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [openingPaywall, setOpeningPaywall] = useState(false);

  useEffect(() => {
    checkNotificationState();
    checkAuthProvider();

    // Check notification state when app comes to foreground
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        checkNotificationState();
        checkAuthProvider();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const checkAuthProvider = () => {
    const provider = authService.getAuthProvider();
    setAuthProvider(provider);
  };

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || "");
      setLastName(user.last_name || "");
    }
  }, [user]);

  const checkNotificationState = async () => {
    try {
      const hasPermission = await messagingService.hasPermission();
      setPushNotifications(hasPermission);
    } catch (error) {
      console.error("Error checking notification permissions:", error);
    }
  };

  /**
   * Opens the notification settings page for the app
   * Uses Android Intent URI for Android 8.0+ to go directly to notification settings
   * This intent opens the specific notification toggles for your app
   */
  const openNotificationSettings = async () => {
    if (Platform.OS === "android") {
      const packageName =
        Constants.expoConfig?.android?.package ||
        "com.arda.instantstatus.dev";
      try {
        // Android 8.0+ (API 26+): Use Intent URI to open notification settings directly
        // This takes the user directly to the app's notification toggle
        const intentUri = `intent:#Intent;action=android.settings.APP_NOTIFICATION_SETTINGS;data=package:${packageName};end`;
        const canOpen = await Linking.canOpenURL(intentUri);
        if (canOpen) {
          await Linking.openURL(intentUri);
        } else {
          // Fallback: Try opening app info page
          await Linking.openURL(`package:${packageName}`);
        }
      } catch (error) {
        // Final fallback: Open general app settings
        try {
          await Linking.openSettings();
        } catch (fallbackError) {
          console.error("Failed to open settings:", fallbackError);
        }
      }
    } else {
      // iOS - open app settings
      await Linking.openSettings();
    }
  };

  const handleSaveFirstName = async () => {
    if (!firstName.trim()) {
      Toast.show({
        type: "error",
        text1: "First name cannot be empty",
      });
      setFirstName(user?.first_name || "");
      setEditingFirstName(false);
      return;
    }

    setSaving(true);
    try {
      await userService.updateMe({ first_name: firstName.trim() });
      await refreshUser();
      setEditingFirstName(false);
      Toast.show({
        type: "success",
        text1: "First name updated successfully",
      });
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: error.message || "Failed to update first name. Check your connection and try again.",
      });
      setFirstName(user?.first_name || "");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLastName = async () => {
    if (!lastName.trim()) {
      Toast.show({
        type: "error",
        text1: "Last name cannot be empty",
      });
      setLastName(user?.last_name || "");
      setEditingLastName(false);
      return;
    }

    setSaving(true);
    try {
      await userService.updateMe({ last_name: lastName.trim() });
      await refreshUser();
      setEditingLastName(false);
      Toast.show({
        type: "success",
        text1: "Last name updated successfully",
      });
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: error.message || "Failed to update last name. Check your connection and try again.",
      });
      setLastName(user?.last_name || "");
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePushNotifications = async (value: boolean) => {
    try {
      const hasPermission = await messagingService.hasPermission();

      if (value) {
        // User wants to enable notifications
        if (!hasPermission) {
          // Request permissions
          const granted = await messagingService.requestPermission();
          if (granted) {
            setPushNotifications(true);
            // Get and register new token
            try {
              const token = await messagingService.getToken();

              if (token && user) {
                await deviceTokenService.registerToken(token);
              }
            } catch (error) {
              console.error("Error registering device token:", error);
              // Don't crash the UI, but show a warning
            }
          } else {
            // Permission denied, offer to open settings
            // On Android 13+, if user denied twice, system won't show popup again
            Alert.alert(
              "Permission Required",
              "It looks like notifications are blocked. Please enable them in settings to stay updated.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Open Settings",
                  onPress: async () => {
                    await openNotificationSettings();
                    // Re-check after a delay (AppState listener will also check when user returns)
                    setTimeout(() => {
                      checkNotificationState();
                    }, 1000);
                  },
                },
              ]
            );
            // Keep switch in current state since permission wasn't granted
            setPushNotifications(false);
          }
        } else {
          // User already has permission, ensure token is registered
          setPushNotifications(true);
          try {
            const token = await messagingService.getToken();
            if (token && user) {
              await deviceTokenService.registerToken(token);
            }
          } catch (error) {
            console.error("Error registering device token:", error);
            // Don't crash the UI, but log the error
            // Token might already be registered, so this is not critical
          }
        }
      } else {
        // User wants to disable notifications
        Alert.alert(
          "Disable Push Notifications",
          "With push notifications off, you may not get instant widget updates. To disable, please turn off notifications in your device settings.",
          [
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => setPushNotifications(true),
            },
            {
              text: "Open Settings",
              onPress: async () => {
                await openNotificationSettings();
                // Re-check after a delay
                setTimeout(() => {
                  checkNotificationState();
                }, 1000);
              },
            },
          ]
        );
        // Keep switch enabled since we can't programmatically disable
        setPushNotifications(true);
      }
    } catch (error: any) {
      console.error("Error handling push notifications:", error);
      Toast.show({
        type: "error",
        text1: error.message || "Failed to update push notifications setting. Please try again.",
      });
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
            Toast.show({
              type: "error",
              text1: error.message || "Failed to logout. Please try again.",
            });
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
      Toast.show({
        type: "error",
        text1: "Please fill in all fields",
      });
      return;
    }

    if (newPassword.length < 8) {
      Toast.show({
        type: "error",
        text1: "Password must be at least 8 characters",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      Toast.show({
        type: "error",
        text1: "New passwords do not match",
      });
      return;
    }

    if (currentPassword === newPassword) {
      Toast.show({
        type: "error",
        text1: "New password must be different from current password",
      });
      return;
    }

    setChangingPassword(true);
    try {
      await authService.changePassword(currentPassword, newPassword);

      Toast.show({
        type: "success",
        text1: "Your password has been updated successfully",
      });
      setChangePasswordModalVisible(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: error.message || "Check your connection and try again.",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            // If password user, show password input modal
            if (authProvider === "password") {
              setDeleteAccountModalVisible(true);
            } else {
              // For Google users, delete directly after first confirmation
              handleConfirmDeleteAccount();
            }
          },
        },
      ]
    );
  };

  const handleConfirmDeleteAccount = async (password?: string) => {
    if (authProvider === "password" && !password?.trim()) {
      Toast.show({
        type: "error",
        text1: "Please enter your password to confirm account deletion",
      });
      return;
    }

    setDeletingAccount(true);
    try {
      await deleteAccount(authProvider === "password" ? password : undefined);
      // Navigation will happen automatically via auth state change
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: error.message || "Check your connection and try again.",
      });
    } finally {
      setDeletingAccount(false);
      setDeleteAccountModalVisible(false);
      setDeletePassword("");
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
      if (success) {
        Toast.show({
          type: "success",
          text1: "Welcome to Premium!",
        });
      }
    } catch (error: any) {
      console.error("Paywall error:", error);
      Toast.show({
        type: "error",
        text1: error.message || "Please try again later.",
      });
    } finally {
      setOpeningPaywall(false);
    }
  };

  const handleManageSubscription = async () => {
    // Navigate to subscription management screen for plan changes
    navigation.navigate("SubscriptionManagement" as never);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View
          style={[styles.header, { paddingTop: Math.max(insets.top + 10, 40) }]}
        >
          <View style={styles.headerContent}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.first_name?.[0]?.toUpperCase() ||
                  user?.last_name?.[0]?.toUpperCase() ||
                  "U"}
              </Text>
            </View>
            <View style={styles.headerText}>
              <Text style={styles.userName}>
                {user?.first_name || ""} {user?.last_name || ""}
              </Text>
              <Text style={styles.userEmail}>{user?.email || "No email"}</Text>
            </View>
          </View>
        </View>

        {/* Profile Information Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Profile Information</Text>

          {/* First Name */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>First Name</Text>
            {editingFirstName ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Enter first name"
                  autoFocus
                  editable={!saving}
                />
                <TouchableOpacity
                  onPress={handleSaveFirstName}
                  disabled={saving}
                  style={styles.saveButton}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#007AFF" />
                  ) : (
                    <Ionicons name="checkmark" size={24} color="#007AFF" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setFirstName(user?.first_name || "");
                    setEditingFirstName(false);
                  }}
                  style={styles.cancelButton}
                >
                  <Ionicons name="close" size={24} color="#999" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.valueRow}
                onPress={() => setEditingFirstName(true)}
              >
                <Text style={styles.valueText}>
                  {user?.first_name || "Not set"}
                </Text>
                <Ionicons name="pencil" size={18} color="#999" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.divider} />

          {/* Last Name */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Last Name</Text>
            {editingLastName ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.input}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Enter last name"
                  autoFocus
                  editable={!saving}
                />
                <TouchableOpacity
                  onPress={handleSaveLastName}
                  disabled={saving}
                  style={styles.saveButton}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#007AFF" />
                  ) : (
                    <Ionicons name="checkmark" size={24} color="#007AFF" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setLastName(user?.last_name || "");
                    setEditingLastName(false);
                  }}
                  style={styles.cancelButton}
                >
                  <Ionicons name="close" size={24} color="#999" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.valueRow}
                onPress={() => setEditingLastName(true)}
              >
                <Text style={styles.valueText}>
                  {user?.last_name || "Not set"}
                </Text>
                <Ionicons name="pencil" size={18} color="#999" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.divider} />

          {/* Email (Read-only) */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email</Text>
            <View style={styles.valueRow}>
              <Text style={[styles.valueText, styles.readOnlyText]}>
                {user?.email || "Not set"}
              </Text>
              <Ionicons name="lock-closed" size={18} color="#999" />
            </View>
          </View>

          <View style={styles.divider} />

          {/* Password / Auth Provider */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Password</Text>
            {authProvider === "password" ? (
              <TouchableOpacity
                style={styles.valueRow}
                onPress={handleChangePassword}
              >
                <Text style={styles.valueText}>Change Password</Text>
                <Ionicons name="chevron-forward" size={18} color="#999" />
              </TouchableOpacity>
            ) : authProvider === "google.com" ? (
              <View style={styles.valueRow}>
                <Text style={[styles.valueText, styles.readOnlyText]}>
                  Signed up with Google
                </Text>
                <Ionicons name="logo-google" size={18} color="#4285F4" />
              </View>
            ) : authProvider === "apple.com" ? (
              <View style={styles.valueRow}>
                <Text style={[styles.valueText, styles.readOnlyText]}>
                  Signed up with Apple
                </Text>
                <Ionicons name="logo-apple" size={18} color="#000" />
              </View>
            ) : (
              <View style={styles.valueRow}>
                <Text style={[styles.valueText, styles.readOnlyText]}>
                  Not available
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Subscription Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Subscription</Text>

          {premiumLoading ? (
            <View style={styles.premiumLoadingContainer}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.premiumLoadingText}>Checking status...</Text>
            </View>
          ) : isPremium ? (
            <>
              <View style={styles.premiumBadge}>
                <Ionicons name="star" size={20} color="#FFD700" />
                <Text style={styles.premiumBadgeText}>Premium Member</Text>
              </View>
              
              {/* Show expiration warning if subscription is cancelled but still active */}
              {willRenew === false && expirationDate && (
                <View style={styles.expirationWarning}>
                  <Ionicons name="information-circle" size={16} color="#F59E0B" />
                  <Text style={styles.expirationWarningText}>
                    Your subscription will expire on {expirationDate.toLocaleDateString()}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.subscriptionButton}
                onPress={handleManageSubscription}
              >
                <Ionicons name="settings-outline" size={20} color="#007AFF" />
                <Text style={styles.subscriptionButtonText}>
                  Manage Subscription
                </Text>
                <Ionicons name="chevron-forward" size={18} color="#999" />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.subscriptionButton, styles.upgradeButton]}
              onPress={handleUpgradeToPremium}
              disabled={openingPaywall}
            >
              {openingPaywall ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="star-outline" size={20} color="#FFFFFF" />
                  <Text style={[styles.subscriptionButtonText, styles.upgradeButtonText]}>
                    Upgrade to Premium
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Settings Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Settings</Text>

          {/* Push Notifications */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Push Notifications</Text>
              <Text style={styles.settingDescription}>
                With push notifications off, you may not get instant widget
                updates
              </Text>
            </View>
            <Switch
              value={pushNotifications}
              onValueChange={handleTogglePushNotifications}
              trackColor={{ false: "#E5E5E5", true: "#007AFF" }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Actions Card */}
        <View style={styles.card}>
          <TouchableOpacity style={styles.actionButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            <Text style={styles.actionButtonText}>Logout</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={[styles.actionButton, styles.dangerButton]}
            onPress={handleDeleteAccount}
          >
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
            <Text style={[styles.actionButtonText, styles.dangerText]}>
              Delete Account
            </Text>
          </TouchableOpacity>
        </View>

        {/* App Info Card */}
        <View style={styles.card}>
          <TouchableOpacity style={styles.infoRow} onPress={() => {}} disabled>
            <Text style={styles.infoLabel}>App Version</Text>
            <Text style={styles.infoValue}>
              {Constants.expoConfig?.version || "1.0.0"}
            </Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.infoRow} onPress={openPrivacyPolicy}>
            <Text style={styles.infoLabel}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.infoRow} onPress={openTermsOfUse}>
            <Text style={styles.infoLabel}>Terms of Use</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Temporary: Widget Preview - Remove later */}
          <TouchableOpacity
            style={styles.infoRow}
            onPress={() => navigation.navigate("WidgetPreview")}
          >
            <Text style={styles.infoLabel}>Widget Preview (Dev)</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Change Password Modal */}
      <Modal
        visible={changePasswordModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setChangePasswordModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity
                onPress={() => {
                  setChangePasswordModalVisible(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                disabled={changingPassword}
              >
                <Ionicons name="close" size={24} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.modalInputContainer}>
                <Text style={styles.modalInputLabel}>Current Password</Text>
                <TextInput
                  style={styles.modalInput}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Enter current password"
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!changingPassword}
                />
              </View>

              <View style={styles.modalInputContainer}>
                <Text style={styles.modalInputLabel}>New Password</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter new password (min 8 characters)"
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!changingPassword}
                />
              </View>

              <View style={styles.modalInputContainer}>
                <Text style={styles.modalInputLabel}>Confirm New Password</Text>
                <TextInput
                  style={styles.modalInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new password"
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!changingPassword}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  changingPassword && styles.modalButtonDisabled,
                ]}
                onPress={handleSavePassword}
                disabled={changingPassword}
              >
                {changingPassword ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalButtonText}>Change Password</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Delete Account Modal */}
      <Modal
        visible={deleteAccountModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setDeleteAccountModalVisible(false);
          setDeletePassword("");
        }}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
            style={{ flex: 1, justifyContent: "flex-end" }}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Delete Account</Text>
                <TouchableOpacity
                  onPress={() => {
                    setDeleteAccountModalVisible(false);
                    setDeletePassword("");
                  }}
                  disabled={deletingAccount}
                >
                  <Ionicons name="close" size={24} color="#111827" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.modalBody}
                contentContainerStyle={styles.modalBodyContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.deleteWarningText}>
                  This action cannot be undone. All your data will be permanently
                  deleted.
                </Text>

                {authProvider === "password" && (
                  <View style={styles.modalInputContainer}>
                    <Text style={styles.modalInputLabel}>
                      Enter your password to confirm
                    </Text>
                    <TextInput
                      style={styles.modalInput}
                      value={deletePassword}
                      onChangeText={setDeletePassword}
                      placeholder="Enter your password"
                      secureTextEntry
                      autoCapitalize="none"
                      editable={!deletingAccount}
                    />
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    styles.deleteButton,
                    deletingAccount && styles.modalButtonDisabled,
                  ]}
                  onPress={() => handleConfirmDeleteAccount(deletePassword)}
                  disabled={deletingAccount}
                >
                  {deletingAccount ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalButtonText}>Delete Account</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelDeleteButton]}
                  onPress={() => {
                    setDeleteAccountModalVisible(false);
                    setDeletePassword("");
                  }}
                  disabled={deletingAccount}
                >
                  <Text style={styles.cancelDeleteButtonText}>Cancel</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
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
    alignItems: "center",
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  headerText: {
    flex: 1,
  },
  userName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: "#6B7280",
  },
  card: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
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
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  valueText: {
    fontSize: 16,
    color: "#111827",
    flex: 1,
  },
  readOnlyText: {
    color: "#6B7280",
  },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#F9FAFB",
  },
  saveButton: {
    padding: 8,
  },
  cancelButton: {
    padding: 8,
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 16,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#111827",
  },
  dangerButton: {
    // Additional styling if needed
  },
  dangerText: {
    color: "#EF4444",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 16,
    color: "#111827",
  },
  infoValue: {
    fontSize: 16,
    color: "#6B7280",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
  },
  modalBody: {
    maxHeight: "100%",
  },
  modalBodyContent: {
    padding: 20,
    paddingBottom: 20,
  },
  modalInputContainer: {
    marginBottom: 20,
  },
  modalInputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
  },
  modalInput: {
    fontSize: 16,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#F9FAFB",
  },
  modalButton: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginTop: 10,
  },
  modalButtonDisabled: {
    opacity: 0.6,
  },
  modalButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  deleteWarningText: {
    fontSize: 14,
    color: "#EF4444",
    marginBottom: 20,
    textAlign: "center",
    lineHeight: 20,
  },
  deleteButton: {
    backgroundColor: "#EF4444",
    marginTop: 10,
  },
  cancelDeleteButton: {
    backgroundColor: "#F3F4F6",
    marginTop: 8,
  },
  cancelDeleteButtonText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
  premiumLoadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    gap: 12,
  },
  premiumLoadingText: {
    fontSize: 14,
    color: "#6B7280",
  },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  premiumBadgeText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#92400E",
  },
  subscriptionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  upgradeButton: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    padding: 16,
    justifyContent: "center",
    marginTop: 8,
  },
  subscriptionButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#111827",
    flex: 1,
  },
  cancelMembershipButton: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FEE2E2",
  },
  cancelMembershipButtonText: {
    color: "#EF4444",
  },
  expirationWarning: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  expirationWarningText: {
    flex: 1,
    fontSize: 14,
    color: "#92400E",
    lineHeight: 20,
  },
  upgradeButtonText: {
    color: "#FFFFFF",
  },
});

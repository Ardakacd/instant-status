import {
  getMessaging,
  requestPermission,
  hasPermission,
  registerDeviceForRemoteMessages,
  getToken,
  deleteToken,
  setBackgroundMessageHandler,
  getInitialNotification,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  AuthorizationStatus,
} from "@react-native-firebase/messaging";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const FCM_TOKEN_KEY = "fcm_token";

export class MessagingService {
  private messagingInstance = getMessaging();
  /**
   * Request notification permissions
   * Checks authorization status first and only requests if needed
   * On iOS, checks if permission is NOT_DETERMINED before requesting
   */
  async requestPermission(): Promise<boolean> {
    try {
      // First check if we already have permission
      const hasPermission = await this.hasPermission();
      if (hasPermission) {
        return true;
      }

      // On iOS, check authorization status before requesting
      if (Platform.OS === "ios") {
        try {
          // Use requestPermission which handles NOT_DETERMINED correctly
          // It will only show prompt if status is NOT_DETERMINED
          const authStatus = await requestPermission(this.messagingInstance);
          return (
            authStatus === AuthorizationStatus.AUTHORIZED ||
            authStatus === AuthorizationStatus.PROVISIONAL
          );
        } catch (iosError) {
          console.error(
            "Error requesting iOS notification permission:",
            iosError
          );
          return false;
        }
      }

      // For Android, request permission
      const authStatus = await requestPermission(this.messagingInstance);
      return (
        authStatus === AuthorizationStatus.AUTHORIZED ||
        authStatus === AuthorizationStatus.PROVISIONAL
      );
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      return false;
    }
  }

  /**
   * Check if notifications are enabled
   */
  async hasPermission(): Promise<boolean> {
    try {
      const authStatus = await hasPermission(this.messagingInstance);
      return (
        authStatus === AuthorizationStatus.AUTHORIZED ||
        authStatus === AuthorizationStatus.PROVISIONAL
      );
    } catch (error) {
      console.error("Error checking notification permission:", error);
      return false;
    }
  }

  /**
   * Register device for remote messages (required on iOS)
   * This must be called before getToken() on iOS
   */
  async registerDeviceForRemoteMessages(): Promise<boolean> {
    try {
      if (Platform.OS === "ios") {
        await registerDeviceForRemoteMessages(this.messagingInstance);
        return true;
      }
      return true; // Android doesn't need this
    } catch (error: any) {
      // If entitlement is missing, log but don't fail completely
      if (
        error.code === "messaging/unknown" &&
        error.message?.includes("aps-environment")
      ) {
        console.warn(
          "Push notification entitlement not configured. Make sure 'aps-environment' is set in entitlements."
        );
      } else {
        console.error("Error registering device for remote messages:", error);
      }
      return false;
    }
  }

  /**
   * Get FCM token - always fetches latest from Firebase to avoid stale tokens
   * On iOS, registerDeviceForRemoteMessages() must be called first
   */
  async getToken(): Promise<string | null> {
    try {
      // On iOS, ensure device is registered for remote messages
      if (Platform.OS === "ios") {
        const registered = await this.registerDeviceForRemoteMessages();
        if (!registered) {
          console.warn(
            "Device registration failed, token may not be available"
          );
        }
      }

      // Always get the latest token from Firebase (not from cache)
      // This ensures we never return a stale token
      const token = await getToken(this.messagingInstance);

      // Update cache with the latest token
      if (token) {
        await AsyncStorage.setItem(FCM_TOKEN_KEY, token);
      } else {
        // Clear cache if token is null
        await AsyncStorage.removeItem(FCM_TOKEN_KEY);
      }

      return token;
    } catch (error: any) {
      // If unregistered error, try registering first
      if (error.code === "messaging/unregistered" && Platform.OS === "ios") {
        try {
          await this.registerDeviceForRemoteMessages();
          const token = await getToken(this.messagingInstance);

          // Cache the token
          if (token) {
            await AsyncStorage.setItem(FCM_TOKEN_KEY, token);
          }

          return token;
        } catch (retryError) {
          console.error(
            "Error getting FCM token after registration:",
            retryError
          );
          return null;
        }
      }
      console.error("Error getting FCM token:", error);
      return null;
    }
  }

  /**
   * Delete FCM token and clear cache
   * Should be called on logout to prevent ghost notifications
   */
  async deleteToken(): Promise<void> {
    try {
      await deleteToken(this.messagingInstance);
      // Clear cached token
      await AsyncStorage.removeItem(FCM_TOKEN_KEY);
    } catch (error) {
      console.error("Error deleting FCM token:", error);
      // Still try to clear cache even if deletion fails
      await AsyncStorage.removeItem(FCM_TOKEN_KEY).catch(() => {});
    }
  }

  /**
   * Unregister device - deletes token and clears cache
   * Should be called on logout
   */
  async unregister(): Promise<void> {
    await this.deleteToken();
  }

  /**
   * Set up background message handler
   */
  setBackgroundMessageHandler(handler: (remoteMessage: any) => Promise<void>) {
    setBackgroundMessageHandler(this.messagingInstance, handler);
  }

  /**
   * Get initial notification (if app was opened from a notification)
   */
  async getInitialNotification() {
    try {
      return await getInitialNotification(this.messagingInstance);
    } catch (error) {
      console.error("Error getting initial notification:", error);
      return null;
    }
  }

  /**
   * Set up foreground message handler
   */
  onMessage(handler: (remoteMessage: any) => void) {
    return onMessage(this.messagingInstance, handler);
  }

  /**
   * Set up notification opened handler
   */
  onNotificationOpenedApp(handler: (remoteMessage: any) => void) {
    return onNotificationOpenedApp(this.messagingInstance, handler);
  }

  /**
   * Listen for token refresh
   * Updates cache when token changes
   */
  onTokenRefresh(handler: (token: string) => void) {
    return onTokenRefresh(this.messagingInstance, async (token: string) => {
      // Update cache when token refreshes
      if (token) {
        await AsyncStorage.setItem(FCM_TOKEN_KEY, token);
      }
      handler(token);
    });
  }
}

export const messagingService = new MessagingService();

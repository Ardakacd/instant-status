import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  unregisterDeviceForRemoteMessages,
} from "@react-native-firebase/messaging";

const FCM_TOKEN_KEY = "fcm_token";

export class MessagingService {
  // In React Native Firebase, getMessaging() automatically uses the default app
  // initialized by the native GoogleService-Info.plist / google-services.json
  private get messagingInstance() {
    return getMessaging();
  }

  /**
   * Request notification permissions
   */
  async requestPermission(): Promise<boolean> {
    try {
      const authStatus = await requestPermission(this.messagingInstance);
      const enabled =
        authStatus === AuthorizationStatus.AUTHORIZED ||
        authStatus === AuthorizationStatus.PROVISIONAL;

      if (enabled && Platform.OS === "ios") {
        await this.registerDeviceForRemoteMessages();
      }

      return enabled;
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
      return false;
    }
  }

  /**
   * Register device for remote messages (Critical for iOS)
   */
  async registerDeviceForRemoteMessages(): Promise<boolean> {
    if (Platform.OS !== "ios") return true;
    try {
      await registerDeviceForRemoteMessages(this.messagingInstance);
      return true;
    } catch (error: any) {
      console.warn("iOS Remote Message Registration Error:", error.message);
      return false;
    }
  }

  /**
   * Get FCM token
   */
  async getToken(): Promise<string | null> {
    try {
      if (Platform.OS === "ios") {
        await this.registerDeviceForRemoteMessages();
      }

      const token = await getToken(this.messagingInstance);
      if (token) {
        await AsyncStorage.setItem(FCM_TOKEN_KEY, token);
        console.log("FCM Token secured:", token);
      }
      return token;
    } catch (error) {
      console.error("Error getting FCM token:", error);
      return null;
    }
  }

  /**
   * Delete token (Logout)
   */
  async deleteToken(): Promise<void> {
    try {
      await deleteToken(this.messagingInstance);
      await AsyncStorage.removeItem(FCM_TOKEN_KEY);
    } catch (error) {
      await AsyncStorage.removeItem(FCM_TOKEN_KEY);
    }
  }

  async unregister(): Promise<void> {
    try {
      const instance = this.messagingInstance;

      // 1. Delete the FCM token from Firebase servers
      await deleteToken(instance);

      // 2. On iOS, explicitly unregister from APNs
      if (Platform.OS === "ios") {
        await unregisterDeviceForRemoteMessages(instance);
      }

      // 3. Clear our local cache
      await AsyncStorage.removeItem(FCM_TOKEN_KEY);

      console.log("Device successfully unregistered from Firebase.");
    } catch (error) {
      console.error("Error during unregister:", error);
      // Fallback: at least clear local storage so the app thinks it's logged out
      await AsyncStorage.removeItem(FCM_TOKEN_KEY).catch(() => {});
    }
  }

  /**
   * Listeners
   */
  onMessage(handler: (remoteMessage: any) => void) {
    return onMessage(this.messagingInstance, handler);
  }

  onNotificationOpenedApp(handler: (remoteMessage: any) => void) {
    return onNotificationOpenedApp(this.messagingInstance, handler);
  }

  async getInitialNotification() {
    return await getInitialNotification(this.messagingInstance);
  }

  onTokenRefresh(handler: (token: string) => void) {
    return onTokenRefresh(this.messagingInstance, async (token) => {
      await AsyncStorage.setItem(FCM_TOKEN_KEY, token);
      handler(token);
    });
  }
}

export const messagingService = new MessagingService();

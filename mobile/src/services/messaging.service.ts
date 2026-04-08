import { Platform, PermissionsAndroid } from "react-native";
import Sentry from "../../sentry";
import {
  getMessaging,
  requestPermission,
  hasPermission,
  registerDeviceForRemoteMessages as firebaseRegisterDevice,
  getToken,
  deleteToken,
  getInitialNotification,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  AuthorizationStatus,
  unregisterDeviceForRemoteMessages,
} from "@react-native-firebase/messaging";

export class MessagingService {
  // In React Native Firebase, getMessaging() automatically uses the default app
  // initialized by the native GoogleService-Info.plist / google-services.json
  private get messagingInstance() {
    return getMessaging();
  }

  /**
   * Request notification permissions
   * Handles Android 13+ (API 33+) POST_NOTIFICATIONS permission explicitly
   */
  async requestPermission(): Promise<boolean> {
    try {
      // Android 13+ (API 33+) requires explicit POST_NOTIFICATIONS permission
      if (Platform.OS === "android" && Platform.Version >= 33) {
        const status = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        const granted = status === PermissionsAndroid.RESULTS.GRANTED;
        
        if (granted) {
          // Also request Firebase messaging permission for token generation
          const authStatus = await requestPermission(this.messagingInstance);
          const firebaseEnabled =
            authStatus === AuthorizationStatus.AUTHORIZED ||
            authStatus === AuthorizationStatus.PROVISIONAL;
          if (!firebaseEnabled) {
            Sentry.captureMessage(
              "Android POST_NOTIFICATIONS granted but Firebase requestPermission returned non-authorized status",
              "warning"
            );
          }
          return firebaseEnabled;
        }
        return false;
      } else {
        // iOS or older Android - use Firebase messaging permission
        const authStatus = await requestPermission(this.messagingInstance);
        const enabled =
          authStatus === AuthorizationStatus.AUTHORIZED ||
          authStatus === AuthorizationStatus.PROVISIONAL;

        if (enabled && Platform.OS === "ios") {
          await this.registerDeviceForRemoteMessages();
        }

        return enabled;
      }
    } catch (error) {
      Sentry.captureException(error);
      return false;
    }
  }

  /**
   * Check if notifications are enabled
   * Handles Android 13+ (API 33+) POST_NOTIFICATIONS permission check
   */
  async hasPermission(): Promise<boolean> {
    try {
      // Android 13+ (API 33+) requires explicit POST_NOTIFICATIONS check
      if (Platform.OS === "android" && Platform.Version >= 33) {
        const status = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        if (!status) {
          return false;
        }
        // Also check Firebase messaging permission
        const authStatus = await hasPermission(this.messagingInstance);
        return (
          authStatus === AuthorizationStatus.AUTHORIZED ||
          authStatus === AuthorizationStatus.PROVISIONAL
        );
      } else {
        // iOS or older Android - use Firebase messaging permission
        const authStatus = await hasPermission(this.messagingInstance);
        return (
          authStatus === AuthorizationStatus.AUTHORIZED ||
          authStatus === AuthorizationStatus.PROVISIONAL
        );
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Register device for remote messages (required on iOS before getToken)
   */
  async registerDeviceForRemoteMessages(): Promise<boolean> {
    if (Platform.OS !== "ios") return true;
    try {
      await firebaseRegisterDevice(this.messagingInstance);
      return true;
    } catch {
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
      return await getToken(this.messagingInstance);
    } catch (error) {
      Sentry.captureException(error);
      return null;
    }
  }

  /**
   * Delete token (Logout)
   */
  async deleteToken(): Promise<void> {
    try {
      await deleteToken(this.messagingInstance);
    } catch {
      // best effort
    }
  }

  async unregister(): Promise<void> {
    try {
      await this.deleteToken();

      // On iOS, explicitly unregister from APNs
      if (Platform.OS === "ios") {
        await unregisterDeviceForRemoteMessages(this.messagingInstance);
      }
    } catch (error) {
      Sentry.captureException(error);
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
    return onTokenRefresh(this.messagingInstance, (token) => {
      try {
        handler(token);
      } catch (error) {
        Sentry.captureException(error);
      }
    });
  }
}

export const messagingService = new MessagingService();

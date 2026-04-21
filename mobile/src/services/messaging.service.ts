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
          // Keep Firebase in sync; do not gate success on AuthorizationStatus — on Android 13+
          // POST_NOTIFICATIONS is the real requirement, and RN Firebase's status often does not
          // match iOS-style AUTHORIZED (see invertase/react-native-firebase #6511 / #7177).
          try {
            const authStatus = await requestPermission(this.messagingInstance);
            const firebaseOk =
              authStatus === AuthorizationStatus.AUTHORIZED ||
              authStatus === AuthorizationStatus.PROVISIONAL;
            if (!firebaseOk) {
              Sentry.captureMessage(
                "Android POST_NOTIFICATIONS granted but Firebase requestPermission returned non-authorized status",
                "warning"
              );
            }
          } catch (e) {
            Sentry.captureException(e);
          }
          return true;
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
        const postNotificationsGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        // Source of truth on Android 13+ — Firebase hasPermission is unreliable vs iOS enums.
        return postNotificationsGranted;
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
   * Token to send to the backend. In __DEV__, drops the cached FCM token first so a Metro
   * reload (`r`) does not re-register a stale native token that FCM rejects on send.
   */
  async getTokenForRegistration(): Promise<string | null> {
    if (__DEV__) {
      try {
        await deleteToken(this.messagingInstance);
      } catch {
        // No token yet or already cleared — ok
      }
    }
    return this.getToken();
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
    } catch (error: any) {
      Sentry.captureException(error, {
        tags: { area: "fcm_get_token" },
        extra: {
          message: error?.message,
          code: error?.code,
          nativeErrorMessage: error?.nativeErrorMessage,
        },
      });
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

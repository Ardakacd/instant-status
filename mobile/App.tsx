import Sentry, { navigationIntegration } from "./sentry";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Linking as RNLinking,
  Platform,
  View,
  Text,
  StyleSheet,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NotificationPermissionModal } from "./src/components/NotificationPermissionModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";
import notifee from "@notifee/react-native";
import Purchases, { LOG_LEVEL } from "react-native-purchases";
import {
  NavigationContainer,
  NavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Typography } from "./src/design";
import { ThemeProvider, useTheme } from "./src/contexts/ThemeContext";
import Toast from "react-native-toast-message";
import * as Linking from "expo-linking";

// Services & Context
import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import { messagingService } from "./src/services/messaging.service";
import { deviceTokenService } from "./src/services/device-token.service";
import { widgetStorageService } from "./src/services/widget-storage.service";
import { syncWidgetFriendsFromApiInBackground } from "./src/services/widget-background-sync";
import { statusService } from "./src/services/status.service";

// Screens
import LoginScreen from "./src/screens/LoginScreen";
import NoInternetScreen from "./src/screens/NoInternetScreen";
import SignUpScreen from "./src/screens/SignUpScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import EmailVerificationScreen from "./src/screens/EmailVerificationScreen";
import ResetPasswordScreen from "./src/screens/ResetPasswordScreen";
import HomeScreen from "./src/screens/HomeScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import ConnectScreen from "./src/screens/ConnectScreen";
import ManageStatusScreen from "./src/screens/ManageStatusScreen";
import SubscriptionManagementScreen from "./src/screens/SubscriptionManagementScreen";

// Custom Toast Configuration
const toastConfig = {
  success: ({ text1, text2 }: any) => {
    const message = text2 || text1 || "";
    return (
      <View style={styles.toastContainer}>
        <View style={[styles.toastContent, styles.successToast]}>
          <View style={styles.iconContainer}>
            <Ionicons name="checkmark-circle" size={24} color="#10B981" />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.text1}>{message}</Text>
          </View>
        </View>
      </View>
    );
  },

  error: ({ text1, text2 }: any) => {
    const message = text2 || text1 || "";
    return (
      <View style={styles.toastContainer}>
        <View style={[styles.toastContent, styles.errorToast]}>
          <View style={styles.iconContainer}>
            <Ionicons name="close-circle" size={24} color="#EF4444" />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.text1}>{message}</Text>
          </View>
        </View>
      </View>
    );
  },

  info: ({ text1, text2 }: any) => {
    const message = text2 || text1 || "";
    return (
      <View style={styles.toastContainer}>
        <View style={[styles.toastContent, styles.infoToast]}>
          <View style={styles.iconContainer}>
            <Ionicons name="information-circle" size={24} color="#007AFF" />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.text1}>{message}</Text>
          </View>
        </View>
      </View>
    );
  },
};

const styles = StyleSheet.create({
  toastContainer: {
    width: "100%",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  toastContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    minHeight: 56,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  successToast: {
    backgroundColor: "#FFFFFF",
    borderLeftWidth: 4,
    borderLeftColor: "#10B981",
  },
  errorToast: {
    backgroundColor: "#FFFFFF",
    borderLeftWidth: 4,
    borderLeftColor: "#EF4444",
  },
  infoToast: {
    backgroundColor: "#FFFFFF",
    borderLeftWidth: 4,
    borderLeftColor: "#007AFF",
  },
  iconContainer: {
    marginRight: 12,
    flexShrink: 0,
  },
  textContainer: {
    flex: 1,
    flexShrink: 1,
  },
  text1: {
    fontSize: 15,
    fontWeight: "600",
    color: "#000000",
    marginBottom: 2,
  },
});

export type RootStackParamList = {
  NoInternet: undefined;
  SignUp: undefined;
  SignIn: undefined;
  EmailVerification: { mode?: string; oobCode?: string } | undefined;
  ResetPassword: { mode?: string; oobCode?: string } | undefined;
  Onboarding: undefined;
  Main: { screen?: string; params?: { friendId?: string } } | undefined;
  Connect: { userId?: string } | undefined;
  ManageStatus: undefined;
  SubscriptionManagement: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

// Keep splash visible during resource loading
SplashScreen.preventAutoHideAsync();

function MainTabs() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.interaction.primary,
        tabBarInactiveTintColor: colors.text.secondary,
        tabBarLabelStyle: {
          fontFamily: Typography.fontFamily.medium,
          fontSize: 11,
        },
        tabBarStyle: {
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom,
          backgroundColor: colors.canvas.background,
          borderTopColor: colors.text.secondary + "20",
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="radio-button-on" size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="person" size={24} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, loading, onboarding, emailVerified, noInternet } = useAuth();
  const navigationRef =
    useRef<NavigationContainerRef<RootStackParamList>>(null);
  const [isNavReady, setIsNavReady] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);

  // Handle deep links when app opens or is already open
  useEffect(() => {
    // Handle initial URL when app opens from deep link
    const handleInitialURL = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl && isNavReady && navigationRef.current) {
        try {
          const parsed = Linking.parse(initialUrl);
          // Handle reset password links manually since screen is conditionally rendered
          if (
            parsed.path === "reset-password" ||
            parsed.path === "/reset-password" ||
            parsed.queryParams?.mode === "resetPassword"
          ) {
            // Navigate to ResetPassword screen
            navigationRef.current.navigate("ResetPassword", {
              mode: parsed.queryParams?.mode as string,
              oobCode: parsed.queryParams?.oobCode as string,
            });
            return; // Don't let React Navigation handle this automatically
          }
          // Let React Navigation handle other links automatically
        } catch (error) {
          Sentry.captureException(error);
        }
      }
    };

    if (isNavReady) {
      handleInitialURL();
    }

    // Handle URL changes when app is already open
    const subscription = Linking.addEventListener("url", (event) => {
      if (isNavReady && navigationRef.current) {
        try {
          const parsed = Linking.parse(event.url);
          // Handle reset password links manually
          if (
            parsed.path === "reset-password" ||
            parsed.path === "/reset-password" ||
            parsed.queryParams?.mode === "resetPassword"
          ) {
            navigationRef.current.navigate("ResetPassword", {
              mode: parsed.queryParams?.mode as string,
              oobCode: parsed.queryParams?.oobCode as string,
            });
            return; // Don't let React Navigation handle this automatically
          }
          // Let React Navigation handle other links automatically
        } catch (error) {
          Sentry.captureException(error);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isNavReady]);

  // Consistency: Handle navigation for all notification types
  const handleNotificationNavigation = (remoteMessage: any) => {
    if (!user || !isNavReady || !navigationRef.current) return;

    const { type, user_id } = remoteMessage.data || {};
    if (type === "status_update" && user_id !== user.id) {
      navigationRef.current.navigate("Main", {
        screen: "Home",
        params: { friendId: user_id },
      });
    } else if (type === "friend_added") {
      navigationRef.current.navigate("Main", { screen: "Home" });
    }
  };

  useEffect(() => {
    let isMounted = true;
    if (!user || !emailVerified || onboarding) return;

    const initMessaging = async () => {
      try {
        // 1. On iOS, request permission automatically on first launch (only once)
        // On Android, only register token if permission already granted (to avoid permission loop)
        const PERMISSION_ASKED_KEY =
          Platform.OS === "ios"
            ? "notification_permission_asked_ios"
            : "notification_permission_asked_android";
        const hasAskedBefore = await AsyncStorage.getItem(PERMISSION_ASKED_KEY);
        const hasPerm = await messagingService.hasPermission();

        if (!hasAskedBefore && !hasPerm && isMounted) {
          // First launch with no permission — show pre-permission modal on both platforms.
          // iOS: system dialog is one-shot, so we gate it behind our modal.
          // Android 13+: POST_NOTIFICATIONS requires explicit request; same modal flow applies.
          setShowNotificationModal(true);
        } else if (hasPerm && isMounted) {
          const token = await messagingService.getToken();
          if (token && user && isMounted) {
            await deviceTokenService.registerToken(token);
          }
        }

        // 2. Cold Start: Notification that opened the app
        if (isMounted) {
          const initial = await messagingService.getInitialNotification();
          if (initial && isMounted) handleNotificationNavigation(initial);
        }
      } catch (error) {
        Sentry.captureException(error);
      }
    };

    initMessaging();

    // 3. Listeners
    const unsubToken = messagingService.onTokenRefresh((t) => {
      if (isMounted && user) {
        deviceTokenService.registerToken(t).catch((error) => {
          Sentry.captureException(error);
        });
      }
    });
    const unsubOpened = messagingService.onNotificationOpenedApp(
      handleNotificationNavigation,
    );
    const unsubForeground = messagingService.onMessage(async (msg) => {
      if (msg.data?.type === "status_update" && isMounted) {
        // Show in-app Toast and update widget
        const optionLabel = msg.data.option_label;
        Toast.show({
          type: "info",
          text1: `${msg.data.display_name} is ${optionLabel.toLowerCase()}`,
          text2: msg.data.note,
        });
        if (isMounted) {
          await widgetStorageService.updateFriendStatus(
            msg.data.user_id,
            msg.data.display_name,
            msg.data.option_id || null,
            msg.data.option_label || null,
            msg.data.option_emoji || null,
            msg.data.option_color || null,
            msg.data.note,
            msg.data.expires_at,
            msg.data.timestamp,
          );
        }
      } else if (msg.data?.type === "friend_removed" && msg.data.peer_user_id && isMounted) {
        await widgetStorageService.removeFriendFromWidget(msg.data.peer_user_id);
      } else if (msg.data?.type === "widget_resync_friends" && isMounted) {
        await syncWidgetFriendsFromApiInBackground();
      } else if (msg.data?.type === "friend_added" && isMounted) {
        await syncWidgetFriendsFromApiInBackground();
      }
    });

    return () => {
      isMounted = false;
      unsubToken();
      unsubOpened();
      unsubForeground();
    };
  }, [user, emailVerified, onboarding, isNavReady]);

  // Show splash screen while loading auth state
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#FFFFFF" }} />
    );
  }

  // Show no internet screen when sync failed due to network
  if (noInternet) {
    return (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="NoInternet" component={NoInternetScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  const handleNotificationModalEnable = async () => {
    const PERMISSION_ASKED_KEY =
      Platform.OS === "ios"
        ? "notification_permission_asked_ios"
        : "notification_permission_asked_android";
    const granted = await messagingService.requestPermission();
    await AsyncStorage.setItem(PERMISSION_ASKED_KEY, "true");
    setShowNotificationModal(false);
    if (granted && user?.id) {
      const token = await messagingService.getToken();
      if (token) {
        await deviceTokenService.registerToken(token);
      }
    } else if (!granted) {
      Alert.alert(
        "Permission Required",
        "Enable notifications in settings to keep your widget updated.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open Settings",
            onPress: () => RNLinking.openSettings(),
          },
        ],
      );
    }
  };

  const handleNotificationModalNotNow = async () => {
    const PERMISSION_ASKED_KEY =
      Platform.OS === "ios"
        ? "notification_permission_asked_ios"
        : "notification_permission_asked_android";
    await AsyncStorage.setItem(PERMISSION_ASKED_KEY, "true");
    setShowNotificationModal(false);
  };

  return (
    <>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          navigationIntegration.registerNavigationContainer(navigationRef);
          setIsNavReady(true);
        }}
        linking={{
          prefixes: [Linking.createURL("/"), "https://instantstatus.app"],
          config: {
            screens: {
              Main: "main",
              Connect: "connect/:userId",
              EmailVerification: {
                path: "verify",
                // Query parameters (mode, oobCode) are automatically parsed from URL
              },
              // ResetPassword is handled manually in handleInitialURL / Linking.addEventListener
              // because it is conditionally rendered based on auth state.
              // It is intentionally absent from this config so React Navigation does not
              // try to parse reset-password URLs (they are not in the screen config anyway).
            },
          },
        }}
      >
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!user ? (
            <>
              <Stack.Screen name="SignIn" component={LoginScreen} />
              <Stack.Screen name="SignUp" component={SignUpScreen} />
              <Stack.Screen
                name="ResetPassword"
                component={ResetPasswordScreen}
              />
            </>
          ) : !emailVerified ? (
            <>
              <Stack.Screen
                name="EmailVerification"
                component={EmailVerificationScreen}
              />
              <Stack.Screen
                name="ResetPassword"
                component={ResetPasswordScreen}
              />
            </>
          ) : onboarding ? (
            <>
              <Stack.Screen name="Onboarding" component={OnboardingScreen} />
              <Stack.Screen
                name="ResetPassword"
                component={ResetPasswordScreen}
              />
            </>
          ) : (
            <>
              <Stack.Screen name="Main" component={MainTabs} />
              <Stack.Screen name="Connect" component={ConnectScreen} />
              <Stack.Screen
                name="ResetPassword"
                component={ResetPasswordScreen}
              />
              <Stack.Screen
                name="ManageStatus"
                component={ManageStatusScreen}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="SubscriptionManagement"
                component={SubscriptionManagementScreen}
                options={{
                  headerShown: false,
                }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>

      {user && showNotificationModal && (
        <NotificationPermissionModal
          visible={showNotificationModal}
          onEnable={handleNotificationModalEnable}
          onNotNow={handleNotificationModalNotNow}
        />
      )}
    </>
  );
}

/**
 * When returning from background, refetch friends' statuses and push to widget storage
 * so the home-screen widget matches the server even if a push was missed.
 * (reloadWidget alone would only redraw stale App Group / AsyncStorage data.)
 */
function WidgetFriendsForegroundSync() {
  const { user } = useAuth();
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (Platform.OS !== "ios" && Platform.OS !== "android") {
      return;
    }

    const sub = AppState.addEventListener("change", async (nextAppState) => {
      const cameToForeground =
        appStateRef.current.match(/inactive|background/) != null &&
        nextAppState === "active";

      if (cameToForeground && user) {
        try {
          const statuses = await statusService.getFriendsStatus();
          await widgetStorageService.saveAllFriendStatuses(statuses);
        } catch (e) {
          Sentry.captureException(e);
        }
      }

      appStateRef.current = nextAppState;
    });

    return () => sub.remove();
  }, [user]);

  return null;
}

function AppNavigatorWithTheme() {
  const { isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppNavigator />
    </>
  );
}

function App() {
  const [appIsReady, setAppIsReady] = useState(false);
  const appState = useRef(AppState.currentState);

  // RevenueCat: configure once at app startup (not in screens, not in re-renders)
  useEffect(() => {
    if (Platform.OS === "web") return;

    const apiKey =
      Platform.OS === "ios"
        ? process.env.EXPO_PUBLIC_RC_IOS_KEY
        : process.env.EXPO_PUBLIC_RC_ANDROID_KEY;

    if (!apiKey) {
      if (__DEV__) console.warn("RevenueCat API key missing");
      return;
    }

    try {
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
      Purchases.configure({ apiKey });
      if (__DEV__) {
        console.log("RevenueCat initialized");
      }
    } catch (error) {
      Sentry.captureException(error);
    }
  }, []);

  useEffect(() => {
    async function prepare() {
      try {
        const fontMap = {
          "Inter-Regular": require("./assets/fonts/Inter-Regular.ttf"),
          "Inter-Medium": require("./assets/fonts/Inter-Medium.ttf"),
          "Inter-SemiBold": require("./assets/fonts/Inter-SemiBold.ttf"),
        };
        await Font.loadAsync(fontMap);
      } catch {
        // Continue even if font loading fails (fallback to system font)
      } finally {
        try {
          await SplashScreen.hideAsync();
        } finally {
          setAppIsReady(true);
        }
      }
    }
    prepare();
  }, []);

  // Reset badge count when app comes to foreground (not on cold start)
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === "active"
        ) {
          // App has come to the foreground - reset badge count
          await notifee.setBadgeCount(0);
        }
        appState.current = nextAppState;
      },
    );

    return () => {
      subscription.remove();
    };
  }, []);

  if (!appIsReady) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <WidgetFriendsForegroundSync />
          <AppNavigatorWithTheme />
          <Toast config={toastConfig} topOffset={60} />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(App);

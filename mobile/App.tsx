import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  AppState,
} from "react-native";
import notifee from "@notifee/react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { widgetStorageService } from "./src/services/widget-storage.service";
import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";
import SignUpScreen from "./src/screens/SignUpScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import EmailVerificationScreen from "./src/screens/EmailVerificationScreen";
import HomeScreen from "./src/screens/HomeScreen";
import FriendsScreen from "./src/screens/FriendsScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import ConnectScreen from "./src/screens/ConnectScreen";
import { deviceTokenService } from "./src/services/device-token.service";
import { messagingService } from "./src/services/messaging.service";
import { StatusState } from "./src/types";
import { statusService } from "./src/services/status.service";

export type RootStackParamList = {
  SignUp: undefined;
  SignIn: undefined;
  EmailVerification: undefined;
  Onboarding: undefined;
  Main: { screen?: string; params?: { friendId?: string } } | undefined;
  Connect: undefined;
};

async function registerForPushNotifications(): Promise<string | undefined> {
  try {
    // Check if notifications are enabled
    const hasPermission = await messagingService.hasPermission();
    if (!hasPermission) {
      const granted = await messagingService.requestPermission();
      if (!granted) {
        return undefined;
      }
    }

    // Get FCM token (auto-registration is handled by React Native Firebase)
    const token = await messagingService.getToken();
    console.log("token", token);
    return token || undefined;
  } catch (error) {
    console.error("Error registering for push notifications:", error);
    return undefined;
  }
}

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#007AFF",
        tabBarInactiveTintColor: "#999",
        tabBarStyle: {
          paddingBottom: Math.max(insets.bottom, 5),
          height: 60 + Math.max(insets.bottom, 5),
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: "Status",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="radio-button-on" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Friends"
        component={FriendsScreen}
        options={{
          tabBarLabel: "Friends",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, loading, onboarding, emailVerified } = useAuth();
  const navigationRef = useRef<any>(null);

  // Reset badge count when app opens/becomes active
  const resetBadgeCount = async () => {
    try {
      // Set badge count to 0 for both iOS and Android
      await notifee.setBadgeCount(0);
    } catch (error) {
      console.error("Error resetting badge count:", error);
    }
  };

  /**
   * Handle notification navigation consistently
   * This is called when:
   * 1. App is opened from a notification (QUIT state)
   * 2. App is opened from background via notification tap
   */
  const handleNotificationNavigation = (remoteMessage: any) => {
    // Ignore notifications if user is not logged in
    if (!user) {
      return;
    }

    if (remoteMessage.data?.type === "status_update") {
      const userId = remoteMessage.data.user_id;
      console.log("Status update notification:", remoteMessage.data);

      // Don't navigate to own status - user already knows their status
      if (userId === user?.id) {
        return;
      }

      // Navigate to Main tab, then Home screen with friend ID to open detail modal
      if (navigationRef.current) {
        navigationRef.current.navigate("Main", {
          screen: "Home",
          params: { friendId: userId },
        });
      }
    } else if (remoteMessage.data?.type === "friend_added") {
      console.log("Friend added notification:", remoteMessage.data);

      // Navigate to Main tab, then Friends screen
      if (navigationRef.current) {
        navigationRef.current.navigate("Main", {
          screen: "Friends",
        });
      }
    }
  };

  // Reset badge count on app launch and when app becomes active
  useEffect(() => {
    // Reset badge immediately on mount
    resetBadgeCount();

    // Listen for app state changes
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        // App has come to the foreground
        resetBadgeCount();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []); // Run once on mount

  useEffect(() => {
    if (!user) return;

    // 1. Register for push notifications
    const registerToken = async () => {
      const token = await registerForPushNotifications();
      if (token) {
        try {
          // Always register token - backend handles updating existing tokens
          await deviceTokenService.registerToken(token);
        } catch (error) {
          console.error("Error registering device token:", error);
        }
      }
    };

    registerToken();

    // 2. Listen for token refresh (FCM tokens can change)
    const unsubscribeTokenRefresh = messagingService.onTokenRefresh(
      async (newToken) => {
        console.log("FCM token refreshed:", newToken);
        if (newToken && user) {
          try {
            // Token refresh means it's definitely different, so register it
            await deviceTokenService.registerToken(newToken);
          } catch (error) {
            console.error("Error registering refreshed token:", error);
          }
        }
      }
    );

    // 3. Check if app was opened from a notification (QUIT state)
    // This handles the case where the app was completely closed
    messagingService.getInitialNotification().then((remoteMessage) => {
      if (remoteMessage) {
        handleNotificationNavigation(remoteMessage);
      }
    });

    // 4. Handle notifications while app is in BACKGROUND (but not quit)
    // User taps notification while app is in background
    const unsubscribeOpened = messagingService.onNotificationOpenedApp(
      (remoteMessage) => {
        handleNotificationNavigation(remoteMessage);
      }
    );

    // 5. Handle notifications while app is in FOREGROUND
    // App is open and user is actively using it
    const unsubscribeForeground = messagingService.onMessage(
      async (remoteMessage) => {

        // Ignore notifications if user is not logged in
        if (!user) {
          return;
        }

        if (remoteMessage.data?.type === "friend_added") {
          const displayName = remoteMessage.data.display_name || "Someone";

          // Show toast notification
          Toast.show({
            type: "success",
            text1: `${displayName} added you as a friend`,
            position: "top",
            visibilityTime: 4000,
            onPress: () => {
              // Navigate to Friends screen when toast is tapped
              if (navigationRef.current) {
                navigationRef.current.navigate("Main", {
                  screen: "Friends",
                });
              }
              Toast.hide();
            },
          });

          // Refresh widget by fetching all friends and updating widget storage
          try {
            const allFriends = await statusService.getFriendsStatus();
            await widgetStorageService.saveAllFriendStatuses(allFriends);
          } catch (error) {
            console.error("Error refreshing widget after friend_added:", error);
          }
        } else if (remoteMessage.data?.type === "status_update") {
          const displayName = remoteMessage.data.display_name || "Someone";
          const state = remoteMessage.data.state as StatusState;
          const note = remoteMessage.data.note;
          const expiresAt = remoteMessage.data.expires_at;
          const userId = remoteMessage.data.user_id;

          // Don't show notification for own status - user already knows their status
          if (userId === user?.id) {
            return;
          }

          // Format expiration time using device locale
          let expirationText = "";
          if (expiresAt) {
            try {
              const expirationDate = new Date(expiresAt);
              const now = new Date();

              if (expirationDate > now) {
                const isToday =
                  expirationDate.getDate() === now.getDate() &&
                  expirationDate.getMonth() === now.getMonth() &&
                  expirationDate.getFullYear() === now.getFullYear();

                if (isToday) {
                  // Format as "Until 6:00 PM" using device locale
                  const timeFormatter = new Intl.DateTimeFormat(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  });
                  expirationText = ` until ${timeFormatter.format(
                    expirationDate
                  )}`;
                } else {
                  // Format as "Until Dec 21, 6:00 PM" using device locale
                  const dateFormatter = new Intl.DateTimeFormat(undefined, {
                    month: "short",
                    day: "numeric",
                  });
                  const timeFormatter = new Intl.DateTimeFormat(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  });
                  expirationText = ` until ${dateFormatter.format(
                    expirationDate
                  )}, ${timeFormatter.format(expirationDate)}`;
                }
              }
            } catch (error) {
              // If formatting fails, just skip expiration text
              console.warn("Error formatting expiration time:", error);
            }
          }

          // Build toast text with note and expiration
          const text2 = note
            ? note
            : expirationText
            ? expirationText.trim()
            : undefined;

          // Show toast notification
          Toast.show({
            type: "info",
            text1: `${displayName} ${getStatusVerb(state)}`,
            text2: text2,
            position: "top",
            visibilityTime: 4000,
            onPress: () => {
              // Navigate to Home screen when toast is tapped
              if (navigationRef.current) {
                navigationRef.current.navigate("Main", {
                  screen: "Home",
                });
              }
              Toast.hide();
            },
          });

          // Update widget storage for iOS
          await widgetStorageService.updateFriendStatus(
            userId,
            displayName,
            state,
            note || null,
            expiresAt || null,
            remoteMessage.data.timestamp || new Date().toISOString()
          );
        }
      }
    );

    return () => {
      unsubscribeTokenRefresh();
      unsubscribeOpened();
      unsubscribeForeground();
    };
  }, [user]);

  if (loading) {
    return null; // Or a loading screen
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName={
          !user
            ? "SignUp"
            : !emailVerified
            ? "EmailVerification"
            : onboarding
            ? "Onboarding"
            : "Main"
        }
      >
        {!user ? (
          <>
            <Stack.Screen name="SignUp" component={SignUpScreen} />
            <Stack.Screen name="SignIn" component={LoginScreen} />
          </>
        ) : !emailVerified ? (
          <Stack.Screen
            name="EmailVerification"
            component={EmailVerificationScreen}
          />
        ) : onboarding ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Connect" component={ConnectScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// Helper function to get status label for display
function getStatusLabel(state: StatusState): string {
  const labels: Record<StatusState, string> = {
    [StatusState.AVAILABLE]: "Available",
    [StatusState.BUSY]: "Busy",
    [StatusState.DND]: "Do Not Disturb",
    [StatusState.FOCUS]: "Focus",
    [StatusState.SOCIAL]: "Social",
    [StatusState.COMMUTE]: "Commute",
  };
  return labels[state] || "Unknown";
}

// Helper function to get status verb form for notifications (e.g., "is available", "is busy")
function getStatusVerb(state: StatusState): string {
  const verbs: Record<StatusState, string> = {
    [StatusState.AVAILABLE]: "is available",
    [StatusState.BUSY]: "is busy",
    [StatusState.DND]: "is busy (do not disturb)",
    [StatusState.FOCUS]: "is focusing",
    [StatusState.SOCIAL]: "is socializing",
    [StatusState.COMMUTE]: "is commuting",
  };
  return verbs[state] || "has updated their status";
}

// Custom Toast Config for native-looking notifications
const toastConfig = {
  success: ({ text1, text2, onPress }: any) => {
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        style={toastStyles.successContainer}
      >
        <View style={toastStyles.content}>
          <View style={toastStyles.iconContainer}>
            <Ionicons name="checkmark-circle" size={24} color="#10B981" />
          </View>
          <View style={toastStyles.textContainer}>
            <Text style={toastStyles.text1} numberOfLines={2}>
              {text1 || ""}
            </Text>
            {text2 ? (
              <Text style={toastStyles.text2} numberOfLines={3}>
                {text2}
              </Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  },
  info: ({ text1, text2, onPress }: any) => {
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        style={toastStyles.infoContainer}
      >
        <View style={toastStyles.content}>
          <View style={toastStyles.iconContainer}>
            <Ionicons name="information-circle" size={24} color="#007AFF" />
          </View>
          <View style={toastStyles.textContainer}>
            <Text style={toastStyles.text1} numberOfLines={2}>
              {text1 || ""}
            </Text>
            {text2 ? (
              <Text style={toastStyles.text2} numberOfLines={3}>
                {text2}
              </Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  },
};

const toastStyles = StyleSheet.create({
  successContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#10B981",
  },
  infoContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#007AFF",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  iconContainer: {
    marginRight: 12,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
    justifyContent: "center",
    minHeight: 24, // Ensure minimum height for text
  },
  text1: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000000",
    marginBottom: 4,
    includeFontPadding: false, // Android: remove extra padding
    textAlignVertical: "center", // Android: center text vertically
  },
  text2: {
    fontSize: 14,
    color: "#333333",
    marginTop: 0,
    lineHeight: 20,
    includeFontPadding: false, // Android: remove extra padding
    textAlignVertical: "center", // Android: center text vertically
  },
});

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <AppNavigator />
      <Toast config={toastConfig} topOffset={60} />
    </AuthProvider>
  );
}

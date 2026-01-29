import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import notifee from "@notifee/react-native";
import {
  NavigationContainer,
  NavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import * as Linking from "expo-linking";

// Services & Context
import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import { messagingService } from "./src/services/messaging.service";
import { deviceTokenService } from "./src/services/device-token.service";
import { widgetStorageService } from "./src/services/widget-storage.service";

// Screens
import LoginScreen from "./src/screens/LoginScreen";
import SignUpScreen from "./src/screens/SignUpScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import EmailVerificationScreen from "./src/screens/EmailVerificationScreen";
import ResetPasswordScreen from "./src/screens/ResetPasswordScreen";
import HomeScreen from "./src/screens/HomeScreen";
import FriendsScreen from "./src/screens/FriendsScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import ConnectScreen from "./src/screens/ConnectScreen";
import ManageStatusScreen from "./src/screens/ManageStatusScreen";

export type RootStackParamList = {
  SignUp: undefined;
  SignIn: undefined;
  EmailVerification: { mode?: string; oobCode?: string } | undefined;
  ResetPassword: { mode?: string; oobCode?: string } | undefined;
  Onboarding: undefined;
  Main: { screen?: string; params?: { friendId?: string } } | undefined;
  Connect: { userId?: string } | undefined;
  WidgetPreview: undefined;
  ManageStatus: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

// Keep splash visible during resource loading
SplashScreen.preventAutoHideAsync();

function MainTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#007AFF",
        tabBarStyle: {
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom,
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
        name="Friends"
        component={FriendsScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="people" size={24} color={color} />
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
  const { user, loading, onboarding, emailVerified } = useAuth();
  const navigationRef =
    useRef<NavigationContainerRef<RootStackParamList>>(null);
  const [isNavReady, setIsNavReady] = useState(false);

  // Handle deep links when app opens or is already open
  useEffect(() => {
    // Handle initial URL when app opens from deep link
    const handleInitialURL = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl && isNavReady && navigationRef.current) {
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
      }
    };

    if (isNavReady) {
      handleInitialURL();
    }

    // Handle URL changes when app is already open
    const subscription = Linking.addEventListener("url", (event) => {
      if (isNavReady && navigationRef.current) {
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
      navigationRef.current.navigate("Main", { screen: "Friends" });
    }
  };

  useEffect(() => {
    let isMounted = true;
    if (!user || !emailVerified || onboarding) return;

    const initMessaging = async () => {
      // 1. On iOS, request permission automatically on first launch (only once)
      // On Android, only register token if permission already granted (to avoid permission loop)
      if (Platform.OS === "ios") {
        const PERMISSION_ASKED_KEY = "notification_permission_asked_ios";
        const hasAskedBefore = await AsyncStorage.getItem(PERMISSION_ASKED_KEY);
        
        if (!hasAskedBefore && isMounted) {
          // First time - request permission automatically on iOS
          console.log("iOS: Requesting notification permission for the first time");
          const granted = await messagingService.requestPermission();
          if (isMounted) {
            await AsyncStorage.setItem(PERMISSION_ASKED_KEY, "true");
            
            if (granted) {
              // Register token if permission granted
              const token = await messagingService.getToken();
              if (token && user && isMounted) {
                await deviceTokenService.registerToken(token);
              }
            } else {
              console.log("iOS: User denied notification permission");
            }
          }
        } else if (isMounted) {
          // Already asked before - just check and register token if granted
          const hasPerm = await messagingService.hasPermission();
          if (hasPerm && isMounted) {
            const token = await messagingService.getToken();
            if (token && user && isMounted) {
              await deviceTokenService.registerToken(token);
            }
          }
        }
      } else if (isMounted) {
        // Android: Only register token if permission already granted
        // Don't automatically request - let user control via ProfileScreen toggle
        const hasPerm = await messagingService.hasPermission();
        if (hasPerm && isMounted) {
          const token = await messagingService.getToken();
          if (token && user && isMounted) {
            await deviceTokenService.registerToken(token);
          }
        }
      }

      // 2. Cold Start: Notification that opened the app
      if (isMounted) {
        const initial = await messagingService.getInitialNotification();
        if (initial && isMounted) handleNotificationNavigation(initial);
      }
    };

    initMessaging();

    // 3. Listeners
    const unsubToken = messagingService.onTokenRefresh((t) => {
      if (isMounted) {
        deviceTokenService.registerToken(t);
      }
    });
    const unsubOpened = messagingService.onNotificationOpenedApp(
      handleNotificationNavigation
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
            msg.data.timestamp
          );
        }
      }
    });

    return () => {
      isMounted = false;
      unsubToken();
      unsubOpened();
      unsubForeground();
    };
  }, [user, emailVerified, onboarding, isNavReady]);

  if (loading) return null;

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => setIsNavReady(true)}
      linking={{
        prefixes: [Linking.createURL("/"), "https://instantstatus.app"],
        config: {
          screens: {
            Main: "main",
            Connect: "connect/:userId",
            EmailVerification: {
              path: "verify",
              // Query parameters (mode, oobCode) will be automatically parsed from URL
            },
            // ResetPassword is handled manually in useEffect to avoid navigation state errors
            // since it's conditionally rendered based on auth state
          },
        },
        // Custom getStateFromPath to handle reset-password links manually
        getStateFromPath: (path, options) => {
          // If it's a reset-password link, return null so we handle it manually
          if (
            path.includes("reset-password") ||
            path.includes("mode=resetPassword")
          ) {
            return undefined; // Let manual navigation handle it
          }
          // Use default React Navigation state parsing for other paths
          return undefined;
        },
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Stack.Screen name="SignIn" component={LoginScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />            
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          </>
        ) : !emailVerified ? (
          <>
            <Stack.Screen
              name="EmailVerification"
              component={EmailVerificationScreen}
            />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          </>
        ) : onboarding ? (
          <>
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Connect" component={ConnectScreen} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
            <Stack.Screen
              name="ManageStatus"
              component={ManageStatusScreen}
              options={{
                headerShown: false,
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    (async () => {
      setAppIsReady(true);
      await SplashScreen.hideAsync();
    })();
  }, []);

  // Reset badge count when app comes to foreground (not on cold start)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // App has come to the foreground - reset badge count
        await notifee.setBadgeCount(0);
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  if (!appIsReady) return null;

  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <AppNavigator />
      <Toast topOffset={60} />
    </AuthProvider>
  );
}

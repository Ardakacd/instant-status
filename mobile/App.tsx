import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
} from "react-native";
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
import HomeScreen from "./src/screens/HomeScreen";
import FriendsScreen from "./src/screens/FriendsScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import ConnectScreen from "./src/screens/ConnectScreen";

export type RootStackParamList = {
  SignUp: undefined;
  SignIn: undefined;
  EmailVerification: { mode?: string; oobCode?: string } | undefined;
  Onboarding: undefined;
  Main: { screen?: string; params?: { friendId?: string } } | undefined;
  Connect: { userId?: string } | undefined;
  WidgetPreview: undefined;
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
    if (!user || !emailVerified || onboarding) return;

    const initMessaging = async () => {
      // 1. Check permissions & Register Token (only if permission already granted)
      // Don't automatically request permission - let user control it via ProfileScreen toggle
      const hasPerm = await messagingService.hasPermission();
      if (hasPerm) {
        // Only register token if permission is already granted
        const token = await messagingService.getToken();
        if (token) await deviceTokenService.registerToken(token);
      }

      // 2. Cold Start: Notification that opened the app
      const initial = await messagingService.getInitialNotification();
      if (initial) handleNotificationNavigation(initial);
    };

    initMessaging();

    // 3. Listeners
    const unsubToken = messagingService.onTokenRefresh((t) =>
      deviceTokenService.registerToken(t)
    );
    const unsubOpened = messagingService.onNotificationOpenedApp(
      handleNotificationNavigation
    );
    const unsubForeground = messagingService.onMessage(async (msg) => {
      if (msg.data?.type === "status_update") {
        // Show in-app Toast and update widget
        Toast.show({
          type: "info",
          text1: `${msg.data.display_name} updated status`,
          text2: msg.data.note,
        });
        await widgetStorageService.updateFriendStatus(
          msg.data.user_id,
          msg.data.display_name,
          msg.data.state,
          msg.data.note,
          msg.data.expires_at,
          msg.data.timestamp
        );
      }
    });

    return () => {
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
        config: { screens: { Main: "main", Connect: "connect/:userId" } },
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
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

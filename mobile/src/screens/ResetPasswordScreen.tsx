import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";
import { authService } from "../services/auth.service";
import { RootStackParamList } from "../../App";

type Props = NativeStackScreenProps<RootStackParamList, "ResetPassword">;

export default function ResetPasswordScreen({ route, navigation }: Props) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [hasHandledReset, setHasHandledReset] = useState(false);
  const [urlParams, setUrlParams] = useState<{ mode?: string; oobCode?: string }>({});

  // Get URL params as fallback if route params are not available
  useEffect(() => {
    const getUrlParams = async () => {
      const url = await Linking.getInitialURL();
      if (url) {
        const parsed = Linking.parse(url);
        setUrlParams({
          mode: parsed.queryParams?.mode as string,
          oobCode: parsed.queryParams?.oobCode as string,
        });
      }
    };
    getUrlParams();
  }, []);

  // Handle password reset link (oobCode from universal link)
  useEffect(() => {
    if (hasHandledReset) return;

    const { oobCode, mode } = route.params || {};
    const finalMode = mode || urlParams.mode;
    const finalOobCode = oobCode || urlParams.oobCode;
    
    // Check if we have valid parameters
    if (finalMode === "resetPassword" && finalOobCode) {
      setHasHandledReset(true);
      return;
    }

    // If we have mode but no oobCode, it's invalid
    if (finalMode === "resetPassword" && !finalOobCode) {
      Alert.alert(
        "Invalid Link",
        "This password reset link is invalid or has expired. Please request a new one.",
        [
          {
            text: "OK",
            onPress: () => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate("SignIn");
              }
            },
          },
        ]
      );
      setHasHandledReset(true);
    }
  }, [route.params, urlParams, hasHandledReset, navigation]);

  const handleResetPassword = async () => {
    if (!password.trim() || !confirmPassword.trim()) {
      Alert.alert("Error", "Please enter both password fields");
      return;
    }

    if (password.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters long");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }

    // Get oobCode from route params or URL params
    const finalOobCode = route.params?.oobCode || urlParams.oobCode;
    if (!finalOobCode) {
      Alert.alert(
        "Error",
        "Invalid reset link. Please request a new password reset email."
      );
      return;
    }

    setResetting(true);
    try {
      await authService.confirmPasswordReset(finalOobCode, password);
      Alert.alert(
        "Password Reset Successful",
        "Your password has been reset successfully. You can now sign in with your new password.",
        [
          {
            text: "OK",
            onPress: () => navigation.navigate("SignIn"),
          },
        ]
      );
    } catch (error: any) {
      if (error.code === "auth/expired-action-code") {
        Alert.alert(
          "Link Expired",
          "This password reset link has expired. Please request a new one.",
          [
            {
              text: "OK",
              onPress: () => navigation.navigate("SignIn"),
            },
          ]
        );
      } else if (error.code === "auth/invalid-action-code") {
        Alert.alert(
          "Invalid Link",
          "This password reset link is invalid. Please request a new one.",
          [
            {
              text: "OK",
              onPress: () => navigation.navigate("SignIn"),
            },
          ]
        );
      } else {
        Alert.alert("Error", error.message || "Failed to reset password");
      }
    } finally {
      setResetting(false);
    }
  };

  // Get oobCode and mode from route params or URL params
  const routeOobCode = route.params?.oobCode;
  const routeMode = route.params?.mode;
  const oobCode = routeOobCode || urlParams.oobCode;
  const mode = routeMode || urlParams.mode;
  const isValidLink = mode === "resetPassword" && oobCode;

  if (!isValidLink) {
    return (
      <View style={styles.container}>
        <View style={styles.invalidLinkContent}>
          <View style={styles.iconContainer}>
            <Ionicons name="lock-closed-outline" size={80} color="#FF3B30" />
          </View>
          <Text style={styles.title}>Invalid Reset Link</Text>
          <Text style={styles.subtitle}>
            This password reset link is invalid or has expired. Please request a new one.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => navigation.navigate("SignIn")}
          >
            <Text style={styles.buttonText}>Go to Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={styles.content}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.navigate("SignIn")}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
          <Text style={styles.backButtonText}>Back to Sign In</Text>
        </TouchableOpacity>

        <View style={styles.iconContainer}>
          <Ionicons name="lock-closed-outline" size={80} color="#007AFF" />
        </View>

        <Text style={styles.title}>Reset Your Password</Text>
        <Text style={styles.subtitle}>
          Enter your new password below. Make sure it's at least 8 characters long.
        </Text>

        <View style={styles.inputContainer}>
          <Ionicons
            name="lock-closed"
            size={20}
            color="#6B7280"
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            placeholder="New Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            editable={!resetting}
          />
        </View>

        <View style={styles.inputContainer}>
          <Ionicons
            name="lock-closed"
            size={20}
            color="#6B7280"
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm New Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            editable={!resetting}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, resetting && styles.buttonDisabled]}
          onPress={handleResetPassword}
          disabled={resetting}
        >
          {resetting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons
                name="checkmark-circle"
                size={20}
                color="#fff"
                style={styles.buttonIcon}
              />
              <Text style={styles.buttonText}>Reset Password</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.securityNote}>
          ⚠️ This link expires in 15 minutes for your security.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  invalidLinkContent: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    paddingTop: 100, // Add extra padding at the top
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  backButton: {
    position: "absolute",
    top: 60,
    left: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 1,
  },
  backButtonText: {
    fontSize: 16,
    color: "#111827",
    fontWeight: "500",
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
    color: "#111827",
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 32,
    color: "#6B7280",
    lineHeight: 24,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: "#F9FAFB",
  },
  inputIcon: {
    marginLeft: 16,
    marginRight: 12,
  },
  input: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: "#111827",
  },
  button: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  securityNote: {
    fontSize: 13,
    color: "#86868b",
    textAlign: "center",
    marginTop: 24,
  },
});


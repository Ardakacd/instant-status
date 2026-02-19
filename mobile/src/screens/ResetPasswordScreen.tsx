import React, { useState, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";
import { authService } from "../services/auth.service";
import { RootStackParamList } from "../../App";
import { ErrorBanner } from "../components/ErrorBanner";
import Toast from "react-native-toast-message";
import { Colors, Spacing, Typography } from "../design";
import { Text } from "../components/primitives/Text";
import { TextInput } from "../components/inputs/TextInput";
import { Button } from "../components/actions/Button";
import { InlineAction } from "../components/actions/InlineAction";
import { Section } from "../components/containers/Section";

type Props = NativeStackScreenProps<RootStackParamList, "ResetPassword">;

export default function ResetPasswordScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [globalError, setGlobalError] = useState("");
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
      setHasHandledReset(true);
    }
  }, [route.params, urlParams, hasHandledReset, navigation]);

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    if (passwordError) setPasswordError("");
    if (globalError) setGlobalError("");
  };

  const handleConfirmPasswordChange = (text: string) => {
    setConfirmPassword(text);
    if (confirmPasswordError) setConfirmPasswordError("");
    if (globalError) setGlobalError("");
  };

  const validateForm = (): boolean => {
    let isValid = true;

    if (!password.trim()) {
      setPasswordError("Password is required");
      isValid = false;
    } else if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      isValid = false;
    }

    if (!confirmPassword.trim()) {
      setConfirmPasswordError("Please confirm your password");
      isValid = false;
    } else if (password !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match");
      isValid = false;
    }

    return isValid;
  };

  const handleResetPassword = async () => {
    if (!validateForm()) {
      return;
    }

    // Get oobCode from route params or URL params
    const finalOobCode = route.params?.oobCode || urlParams.oobCode;
    if (!finalOobCode) {
      setGlobalError("Invalid reset link. Please request a new password reset email.");
      return;
    }

    setResetting(true);
    setGlobalError("");
    try {
      await authService.confirmPasswordReset(finalOobCode, password);
      Toast.show({
        type: "success",
        text1: "Password Reset Successful",
        text2: "Your password has been reset successfully. You can now sign in.",
      });
      // Navigate to sign in after a brief delay
      setTimeout(() => {
        navigation.navigate("SignIn");
      }, 1500);
    } catch (error: any) {
      if (error.code === "auth/expired-action-code") {
        setGlobalError("This password reset link has expired. Please request a new one.");
      } else if (error.code === "auth/invalid-action-code") {
        setGlobalError("This password reset link is invalid. Please request a new one.");
      } else {
        setGlobalError(error.message || "Failed to reset password. Please try again.");
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
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          bounces={true}
        >
          <Section spacing="md" style={styles.content}>
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Ionicons name="lock-closed-outline" size={64} color={Colors.interaction.accent} />
              </View>
              <Text variant="primary" style={styles.title}>Invalid Reset Link</Text>
              <Text variant="secondary" style={styles.subtitle}>
                This password reset link is invalid or has expired. Please request a new one.
              </Text>
            </View>

            <Button
              variant="primary"
              onPress={() => navigation.navigate("SignIn")}
            >
              Go to Sign In
            </Button>
          </Section>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        <Section spacing="md" style={styles.content}>
          {/* Back Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.navigate("SignIn")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={20} color={Colors.text.primary} />
            <InlineAction fontSize={14}>Back to Sign In</InlineAction>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="lock-closed-outline" size={64} color={Colors.interaction.primary} />
            </View>
            <Text variant="primary" style={styles.title}>Reset Your Password</Text>
            <Text variant="secondary" style={styles.subtitle}>
              Enter your new password below. Make sure it's at least 8 characters long.
            </Text>
          </View>

          {/* Global Error Banner */}
          {globalError && (
            <ErrorBanner
              message={globalError}
              onDismiss={() => setGlobalError("")}
            />
          )}

          <Section spacing="sm">
            <View>
              <TextInput
                placeholder="New Password"
                value={password}
                onChangeText={handlePasswordChange}
                secureTextEntry
                autoCapitalize="none"
                editable={!resetting}
                error={!!passwordError}
              />
              {passwordError && (
                <Text variant="hint" style={styles.errorText}>{passwordError}</Text>
              )}
            </View>

            <View>
              <TextInput
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChangeText={handleConfirmPasswordChange}
                secureTextEntry
                autoCapitalize="none"
                editable={!resetting}
                error={!!confirmPasswordError}
              />
              {confirmPasswordError && (
                <Text variant="hint" style={styles.errorText}>{confirmPasswordError}</Text>
              )}
            </View>

            <Button
              variant="primary"
              onPress={handleResetPassword}
              loading={resetting}
              disabled={resetting}
            >
              Reset Password
            </Button>
          </Section>

          <Text variant="hint" style={styles.securityNote}>
            ⚠️ This link expires in 15 minutes for your security.
          </Text>

          {/* Bottom spacer for balanced centering */}
          <View style={{ flex: 1, minHeight: Spacing.xl }} />
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xl,
  },
  content: {
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    alignSelf: "flex-start",
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.lg,
    marginTop: Spacing.md,
  },
  iconContainer: {
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 28,
    fontFamily: Typography.fontFamily.semiBold,
    textAlign: "center",
    lineHeight: 34,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  errorText: {
    marginTop: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  securityNote: {
    fontSize: 13,
    textAlign: "center",
    marginTop: Spacing.md,
  },
});

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { authService } from "../services/auth.service";
import { RootStackParamList } from "../../App";
import { ErrorBanner } from "../components/ErrorBanner";
import Toast from "react-native-toast-message";
import { Colors, Spacing, Typography, useResponsive } from "../design";
import { Text } from "../components/primitives/Text";
import { TextInput } from "../components/inputs/TextInput";
import { Button } from "../components/actions/Button";
import { InlineAction } from "../components/actions/InlineAction";
import { Section } from "../components/containers/Section";

type Props = NativeStackScreenProps<RootStackParamList, "ResetPassword">;

export default function ResetPasswordScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { horizontalPadding, isSmallScreen } = useResponsive();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [globalError, setGlobalError] = useState("");
  const [resetting, setResetting] = useState(false);
  const [validatingCode, setValidatingCode] = useState(true);
  const [codeError, setCodeError] = useState("");
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    };
  }, []);

  // Verify the oobCode on mount so the user gets an error immediately if
  // the link has already been used or expired, rather than after typing a password.
  useEffect(() => {
    const { oobCode } = route.params || {};
    if (!oobCode) {
      setValidatingCode(false);
      return;
    }
    authService.verifyResetCode(oobCode).then(() => {
      setValidatingCode(false);
    }).catch((err: any) => {
      setCodeError(err.message || "Invalid or expired reset link.");
      setValidatingCode(false);
    });
  }, []);

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

    const finalOobCode = route.params?.oobCode;
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
      navTimerRef.current = setTimeout(() => {
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

  const { oobCode, mode } = route.params || {};
  // isValidLink: route params present and server confirmed code is valid
  const isValidLink = mode === "resetPassword" && oobCode && !codeError;

  const scrollContentStyle = [
    styles.scrollContent,
    {
      paddingHorizontal: horizontalPadding,
    },
  ];

  if (validatingCode) {
    // Show nothing while we verify the code so there's no flash of invalid-link UI
    return <View style={[styles.container, { paddingTop: insets.top }]} />;
  }

  if (!isValidLink) {
    const subtitle = codeError
      ? codeError
      : "This password reset link is invalid or has expired. Please request a new one.";
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView
          contentContainerStyle={scrollContentStyle}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          bounces={true}
        >
          <Section spacing="md" style={styles.content}>
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Ionicons name="lock-closed-outline" size={64} color={Colors.interaction.accent} />
              </View>
              <Text variant="primary" style={[styles.title, isSmallScreen && { fontSize: 24, lineHeight: 30 }]}>Invalid Reset Link</Text>
              <Text variant="secondary" style={styles.subtitle}>
                {subtitle}
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
        contentContainerStyle={scrollContentStyle}
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
            <Text variant="primary" style={[styles.title, isSmallScreen && { fontSize: 24, lineHeight: 30 }]}>Reset Your Password</Text>
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

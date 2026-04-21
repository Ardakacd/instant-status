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
import { toast } from "../utils/toast";
import { Spacing, Typography, useResponsive, useColors } from "../design";
import { Text } from "../components/primitives/Text";
import { TextInput } from "../components/inputs/TextInput";
import { Button } from "../components/actions/Button";
import { Section } from "../components/containers/Section";

type Props = NativeStackScreenProps<RootStackParamList, "ResetPassword">;

export default function ResetPasswordScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { horizontalPadding, fs, height } = useResponsive();
  const isShortScreen = height < 700;
  const colors = useColors();
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
      toast.show({
        type: "success",
        text1: "Password Reset Successful",
        text2: "Your password has been reset successfully. You can now sign in.",
      });
      // Navigate to sign in after a brief delay
      navTimerRef.current = setTimeout(() => {
        navigation.navigate("SignIn");
      }, 1500);
    } catch (error: any) {
      setGlobalError(error.message || "Failed to reset password. Please try again.");
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
    return <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.canvas.background }]} />;
  }

  if (!isValidLink) {
    const subtitle = codeError
      ? codeError
      : "This password reset link is invalid or has expired. Please request a new one.";
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.canvas.background }]}>
        <TouchableOpacity
          style={[styles.backButton, { paddingHorizontal: horizontalPadding }]}
          onPress={() => navigation.navigate("SignIn")}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
          <Text variant="secondary" style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={scrollContentStyle}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          bounces={true}
        >
          <Section spacing="md" style={styles.content}>
            <View style={styles.header}>
              <View style={[styles.iconCircle, {
                  backgroundColor: colors.interaction.error,
                  width: isShortScreen ? 56 : 72,
                  height: isShortScreen ? 56 : 72,
                  borderRadius: isShortScreen ? 28 : 36,
                }]}>
                <Ionicons name="lock-closed-outline" size={isShortScreen ? fs(26) : fs(32)} color="#FFFFFF" />
              </View>
              <Text variant="primary" style={[styles.title, { fontSize: fs(28), lineHeight: fs(34) }]}>
                Invalid Link
              </Text>
              <Text variant="secondary" style={styles.subtitle}>{subtitle}</Text>
            </View>
            <Button variant="primary" onPress={() => navigation.navigate("SignIn")}>
              Go to Sign In
            </Button>
          </Section>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.canvas.background }]}>
      <TouchableOpacity
        style={[styles.backButton, { paddingHorizontal: horizontalPadding }]}
        onPress={() => navigation.navigate("SignIn")}
      >
        <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        <Text variant="secondary" style={styles.backButtonText}>Back to Sign In</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={scrollContentStyle}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        <Section spacing="md" style={styles.content}>
          <View style={styles.header}>
            <View style={[styles.iconCircle, {
              backgroundColor: colors.interaction.primary,
              width: isShortScreen ? 56 : 72,
              height: isShortScreen ? 56 : 72,
              borderRadius: isShortScreen ? 28 : 36,
            }]}>
              <Ionicons name="lock-open-outline" size={isShortScreen ? fs(26) : fs(32)} color="#FFFFFF" />
            </View>
            <Text variant="primary" style={[styles.title, { fontSize: fs(28), lineHeight: fs(34) }]}>
              New Password
            </Text>
            <Text variant="secondary" style={styles.subtitle}>
              Choose a strong password at least 8 characters long.
            </Text>
          </View>

          {globalError && (
            <ErrorBanner message={globalError} onDismiss={() => setGlobalError("")} />
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

          <View style={[styles.tipBox, { backgroundColor: colors.canvas.card }]}>
            <Ionicons name="time-outline" size={16} color={colors.text.secondary} />
            <Text variant="secondary" style={styles.tipText}>
              This link expires in 15 minutes for your security.
            </Text>
          </View>
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  backButtonText: {
    fontSize: 15,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  content: {},
  header: {
    alignItems: "center",
    marginBottom: Spacing.lg,
    marginTop: Spacing.md,
  },
  iconCircle: {
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: Typography.fontFamily.semiBold,
    textAlign: "center",
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
  tipBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.md,
  },
  tipText: {
    fontSize: 13,
    flex: 1,
  },
});

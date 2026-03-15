import React, { useState, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  AppState,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { authService } from "../services/auth.service";
import { auth } from "../config/firebase";
import { useAuth } from "../contexts/AuthContext";
import { RootStackParamList } from "../../App";
import Toast from "react-native-toast-message";
import { Colors, Spacing, Typography, useResponsive } from "../design";
import { Text } from "../components/primitives/Text";
import { Button } from "../components/actions/Button";

type Props = NativeStackScreenProps<RootStackParamList, "EmailVerification">;

export default function EmailVerificationScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const { horizontalPadding } = useResponsive();
  const { checkEmailVerification, logout, authError } = useAuth();
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [hasHandledVerification, setHasHandledVerification] = useState(false);

  // Handle email verification link (oobCode from universal link via route.params)
  useEffect(() => {
    if (hasHandledVerification) return;

    const { oobCode, mode } = route.params || {};
    if (mode !== "verifyEmail") return;

    // Set guard synchronously so a re-mount before async work completes cannot double-fire
    setHasHandledVerification(true);

    if (oobCode) {
      handleVerifyEmail(oobCode);
    } else {
      handleCheckVerificationOnly();
    }
  }, [route.params]);

  const handleCheckVerificationOnly = async () => {
    setVerifying(true);
    try {
      await authService.reloadUser();
      await checkEmailVerification();
      setVerifying(false);
    } catch (error: any) {
      setVerifying(false);
    }
  };

  const handleVerifyEmail = async (oobCode: string) => {
    setVerifying(true);
    try {
      await authService.verifyEmail(oobCode);
      await authService.reloadUser();
      await checkEmailVerification();
      setVerifying(false);
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: error.message || "Failed to verify email. Please try again.",
      });
      setVerifying(false);
    }
  };

  // Re-check verification when app comes to foreground (user may have verified in another tab)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && auth.currentUser) {
        checkEmailVerification();
      }
    });
    return () => subscription.remove();
  }, [checkEmailVerification]);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleResendVerification = async () => {
    if (resendCooldown > 0) {
      return;
    }

    setSending(true);
    try {
      await authService.sendEmailVerification();
      setResendCooldown(60);
      Toast.show({
        type: "success",
        text1: "Verification email has been sent. Please check your inbox.",
      });
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: error.message || "Failed to send verification email. Please try again.",
      });
    } finally {
      setSending(false);
    }
  };

  const handleGoBack = () => {
    Alert.alert(
      "Go Back",
      "Are you sure you want to go back? You'll need to sign in again after verifying your email.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Go Back",
          style: "destructive",
          onPress: async () => {
            try {
              await logout();
            } catch (error: any) {
              Toast.show({
                type: "error",
                text1: error.message || "Failed to logout. Please try again.",
              });
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.backButton, { top: insets.top + Spacing.md }]}
        onPress={handleGoBack}
      >
        <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
        <Text variant="primary" style={styles.backButtonText}>
          Go Back
        </Text>
      </TouchableOpacity>

      <View
        style={[
          styles.content,
          {
            paddingHorizontal: horizontalPadding,
          },
        ]}
      >
        <View style={styles.iconContainer}>
          <Ionicons name="mail-outline" size={80} color={Colors.interaction.primary} />
        </View>

        <Text variant="primary" style={styles.title}>
          Verify Your Email
        </Text>
        {authError && (
          <Text variant="primary" style={styles.authErrorText}>
            {authError}
          </Text>
        )}
        <Text variant="secondary" style={styles.subtitle}>
          {verifying
            ? "Verifying your email..."
            : "We've sent a verification email. Click the link in the email to automatically verify your account. It may take a minute to arrive, check your spam folder if needed."}
        </Text>

        {verifying && (
          <View style={styles.verifyingContainer}>
            <ActivityIndicator size="large" color={Colors.interaction.primary} />
          </View>
        )}

        <Button
          variant="primary"
          onPress={handleResendVerification}
          disabled={sending || resendCooldown > 0}
          loading={sending}
          fullWidth
          style={styles.button}
        >
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Verification Email"}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas.background,
    paddingHorizontal: Spacing.lg,
  },
  backButton: {
    position: "absolute",
    top: Spacing.lg,
    left: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    zIndex: 1,
  },
  backButtonText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.medium,
  },
  content: {
    flex: 1,
    justifyContent: "center",
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: 28,
    fontFamily: Typography.fontFamily.semiBold,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  authErrorText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.interaction.error,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 24,
  },
  button: {
    marginTop: Spacing.sm,
  },
  verifyingContainer: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
    alignItems: "center",
  },
});

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
  const { horizontalPadding, fs } = useResponsive();
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
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: "Failed to check verification status. Please try again.",
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyEmail = async (oobCode: string) => {
    setVerifying(true);
    try {
      await authService.verifyEmail(oobCode);
      await checkEmailVerification();
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: error.message || "Failed to verify email. Please try again.",
      });
    } finally {
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
      // Apply cooldown on rate-limit errors too so rapid taps don't keep hitting the backend
      if ((error as any).statusCode === 429) {
        setResendCooldown(60);
      }
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Back button */}
      <TouchableOpacity
        style={[styles.backButton, { paddingHorizontal: horizontalPadding }]}
        onPress={handleGoBack}
      >
        <Ionicons name="arrow-back" size={22} color={Colors.text.primary} />
        <Text variant="secondary" style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>

      <View style={[styles.content, { paddingHorizontal: horizontalPadding }]}>
        {/* Icon */}
        <View style={styles.iconCircle}>
          <Ionicons name="mail-outline" size={fs(32)} color="#FFFFFF" />
        </View>

        <Text variant="primary" style={[styles.title, { fontSize: fs(28), lineHeight: fs(34) }]}>
          Check your inbox
        </Text>

        {authError && (
          <Text style={styles.authErrorText}>{authError}</Text>
        )}

        <Text variant="secondary" style={styles.subtitle}>
          We sent a verification link to your email. Tap it to confirm your account.
        </Text>

        <View style={styles.tipBox}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.text.secondary} />
          <Text variant="secondary" style={styles.tipText}>
            Can't find it? Check your spam folder.
          </Text>
        </View>

        {verifying ? (
          <View style={styles.verifyingContainer}>
            <ActivityIndicator size="small" color={Colors.interaction.primary} />
            <Text variant="secondary" style={styles.verifyingText}>Checking verification…</Text>
          </View>
        ) : (
          <View style={styles.actions}>
            <Button
              variant="primary"
              onPress={handleCheckVerificationOnly}
              fullWidth
            >
              I've verified my email
            </Button>

            <Button
              variant="secondary"
              onPress={handleResendVerification}
              disabled={sending || resendCooldown > 0}
              loading={sending}
              fullWidth
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend email"}
            </Button>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas.background,
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
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.interaction.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: Typography.fontFamily.semiBold,
    textAlign: "center",
    marginBottom: Spacing.sm,
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
    lineHeight: 24,
    marginBottom: Spacing.md,
  },
  tipBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xl,
    alignSelf: "stretch",
  },
  tipText: {
    fontSize: 13,
    flex: 1,
  },
  actions: {
    alignSelf: "stretch",
    gap: Spacing.sm,
  },
  verifyingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginVertical: Spacing.lg,
  },
  verifyingText: {
    fontSize: 15,
  },
});

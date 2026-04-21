import React, { useState, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  AppState,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { authService } from "../services/auth.service";
import { auth } from "../config/firebase";
import { useAuth } from "../contexts/AuthContext";
import { RootStackParamList } from "../../App";
import { toast } from "../utils/toast";
import { Spacing, Typography, useResponsive, useColors } from "../design";
import { Text } from "../components/primitives/Text";
import { Button } from "../components/actions/Button";

type Props = NativeStackScreenProps<RootStackParamList, "EmailVerification">;

export default function EmailVerificationScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const { horizontalPadding, fs, height } = useResponsive();
  const isShortScreen = height < 700;
  const colors = useColors();
  const { checkEmailVerification, logout, clearAuthError } = useAuth();
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [notVerifiedYet, setNotVerifiedYet] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [hasHandledVerification, setHasHandledVerification] = useState(false);

  // Clear the auth error on mount — this screen already explains what to do
  useEffect(() => {
    clearAuthError();
  }, []);

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
    setNotVerifiedYet(false);
    setVerifying(true);
    try {
      await authService.reloadUser();
      await checkEmailVerification();
      // If still mounted here, email is not verified (verified → navigator routes away)
      setNotVerifiedYet(true);
    } catch (error: any) {
      toast.show({
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
      toast.show({
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
      toast.show({
        type: "success",
        text1: "Verification email has been sent. Please check your inbox.",
      });
    } catch (error: any) {
      // Apply cooldown on rate-limit errors too so rapid taps don't keep hitting the backend
      if ((error as any).statusCode === 429) {
        setResendCooldown(60);
      }
      toast.show({
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
              toast.show({
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
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.canvas.background }]}>
      {/* Back button */}
      <TouchableOpacity
        style={[styles.backButton, { paddingHorizontal: horizontalPadding }]}
        onPress={handleGoBack}
      >
        <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        <Text variant="secondary" style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: horizontalPadding, paddingBottom: Spacing.xl },
        ]}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Icon */}
        <View style={[styles.iconCircle, {
          backgroundColor: colors.interaction.primary,
          width: isShortScreen ? 56 : 72,
          height: isShortScreen ? 56 : 72,
          borderRadius: isShortScreen ? 28 : 36,
          marginBottom: isShortScreen ? Spacing.md : Spacing.lg,
        }]}>
          <Ionicons name="mail-outline" size={isShortScreen ? fs(26) : fs(32)} color="#FFFFFF" />
        </View>

        <Text variant="primary" style={[styles.title, { fontSize: fs(28), lineHeight: fs(34) }]}>
          Check your inbox
        </Text>

        <Text variant="secondary" style={styles.subtitle}>
          We sent a verification link to your email. Tap it to confirm your account.
        </Text>

        <View style={[styles.tipBox, { backgroundColor: colors.canvas.card }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.text.secondary} />
          <Text variant="secondary" style={styles.tipText}>
            Can't find it? Check your spam folder.
          </Text>
        </View>

        {verifying ? (
          <View style={styles.verifyingContainer}>
            <ActivityIndicator size="small" color={colors.interaction.primary} />
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

            {notVerifiedYet && (
              <View style={[styles.notVerifiedBox, { backgroundColor: colors.tint.error }]}>
                <Ionicons name="mail-outline" size={15} color={colors.interaction.error} />
                <Text style={[styles.notVerifiedText, { color: colors.interaction.error }]}>
                  Please verify your email address to continue.
                </Text>
              </View>
            )}
          </View>
        )}
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
  content: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: Spacing.lg,
  },
  iconCircle: {
    justifyContent: "center",
    alignItems: "center",
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
    marginBottom: Spacing.md,
  },
  tipBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
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
  notVerifiedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  notVerifiedText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    flex: 1,
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

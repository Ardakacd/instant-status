import React, { useState } from "react";
import {
  View,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Modal,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";
import { authService } from "../services/auth.service";
import { ErrorBanner } from "../components/ErrorBanner";
import Toast from "react-native-toast-message";
import { Colors, Borders, Spacing, Typography, SAFE_AREA_BOTTOM, useResponsive, useColors } from "../design";
import { Text } from "../components/primitives/Text";
import { TextInput } from "../components/inputs/TextInput";
import { Button } from "../components/actions/Button";
import { InlineAction } from "../components/actions/InlineAction";
import { Section } from "../components/containers/Section";

type Props = NativeStackScreenProps<RootStackParamList, "SignIn">;

export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { horizontalPadding, fs } = useResponsive();
  const colors = useColors();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [forgotPasswordModalVisible, setForgotPasswordModalVisible] =
    useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetEmailError, setResetEmailError] = useState("");
  const [sendingReset, setSendingReset] = useState(false);
  const { signIn, signInWithGoogle, signInWithApple, authError, clearAuthError } = useAuth();

  const handleEmailChange = (text: string) => {
    setEmail(text);
    if (emailError) setEmailError("");
    if (globalError) setGlobalError("");
    if (authError) clearAuthError();
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    if (passwordError) setPasswordError("");
    if (globalError) setGlobalError("");
    if (authError) clearAuthError();
  };

  const validateLoginForm = (): boolean => {
    let isValid = true;

    if (!email.trim()) {
      setEmailError("Email is required");
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError("Please enter a valid email address");
      isValid = false;
    }

    if (!password.trim()) {
      setPasswordError("Password is required");
      isValid = false;
    }

    return isValid;
  };

  const handleSignIn = async () => {
    if (!validateLoginForm()) {
      return;
    }

    setLoading(true);
    setGlobalError(""); // Clear any previous errors
    try {
      await signIn(email.trim(), password);
      // Email verification check is handled in AuthContext and navigation
    } catch (error: any) {
      const errorMessage =
        error.message || error.originalError?.message || "Failed to sign in";
      // Show server errors as global error banner (not validation errors)
      setGlobalError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      // No error means success or cancellation (both handled silently)
    } catch (error: any) {
      // Only show error if it's not a cancellation
      if (!error.message?.includes("cancelled")) {
        Toast.show({
          type: "error",
          text1: "Failed to sign in with Google. Please try again.",
        });
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setAppleLoading(true);
    try {
      await signInWithApple();
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: "Failed to sign in with Apple. Please try again.",
      });
    } finally {
      setAppleLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setResetEmail(email); // Pre-fill with email from login form if available
    setForgotPasswordModalVisible(true);
  };

  const handleResetEmailChange = (text: string) => {
    setResetEmail(text);
    if (resetEmailError) setResetEmailError(""); // Clear error when user starts typing
  };

  const handleSendPasswordReset = async () => {
    if (!resetEmail.trim()) {
      setResetEmailError("Email is required");
      return;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail.trim())) {
      setResetEmailError("Please enter a valid email address");
      return;
    }

    setSendingReset(true);
    try {
      await authService.resetPassword(resetEmail.trim());
      Toast.show({
        type: "success",
        text1: "Please check your email for instructions to reset your password.",
      });
      setForgotPasswordModalVisible(false);
      setResetEmail("");
      setResetEmailError("");
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: error.message || "Failed to send password reset email. Please try again.",
      });
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.canvas.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: horizontalPadding },
        ]}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        <Section spacing="md" style={styles.content}>
          <View style={styles.header}>
            <View style={[styles.logoCircle, { backgroundColor: colors.interaction.primary }]}>
              <Ionicons name="radio-outline" size={28} color="#FFFFFF" />
            </View>
            <Text variant="primary" style={[styles.title, { fontSize: fs(28), lineHeight: fs(34) }]}>
              Welcome Back
            </Text>
            <Text variant="secondary" style={styles.subtitle}>Sign in to your account</Text>
          </View>

          {authError && (
            <Text variant="hint" style={[styles.authErrorText, { color: colors.interaction.error }]}>{authError}</Text>
          )}
          {globalError && (
            <ErrorBanner message={globalError} />
          )}

          <Section spacing="sm">
            <View>
              <TextInput
                placeholder="Email"
                value={email}
                onChangeText={handleEmailChange}
                keyboardType="email-address"
                autoCapitalize="none"
                error={!!emailError}
              />
              {emailError && (
                <Text variant="hint" style={styles.errorText}>{emailError}</Text>
              )}
            </View>

            <View>
              <TextInput
                placeholder="Password"
                value={password}
                onChangeText={handlePasswordChange}
                secureTextEntry
                autoCapitalize="none"
                error={!!passwordError}
              />
              {passwordError && (
                <Text variant="hint" style={styles.errorText}>{passwordError}</Text>
              )}
            </View>

            <View style={styles.forgotPasswordContainer}>
              <InlineAction
                onPress={handleForgotPassword}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                fontSize={14}
              >
                Forgot Password?
              </InlineAction>
            </View>

            <Button variant="primary" onPress={handleSignIn} loading={loading} disabled={loading}>
              Sign In
            </Button>
          </Section>

          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: colors.text.secondary }]} />
            <Text variant="hint" style={[styles.dividerText, { color: colors.text.secondary }]}>OR</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.text.secondary }]} />
          </View>

          {/* Google */}
          <Pressable
            onPress={handleGoogleSignIn}
            disabled={googleLoading || loading || appleLoading}
            style={({ pressed }) => [styles.socialButton, { backgroundColor: colors.canvas.card }, pressed && styles.socialButtonPressed]}
          >
            {googleLoading ? (
              <Text variant="secondary" style={styles.socialButtonText}>Loading…</Text>
            ) : (
              <>
                <Text style={styles.googleIcon}>G</Text>
                <Text variant="primary" style={styles.socialButtonText}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          {/* Apple (iOS only) */}
          {Platform.OS === "ios" && (
            <Pressable
              onPress={handleAppleSignIn}
              disabled={appleLoading || loading || googleLoading}
              style={({ pressed }) => [styles.socialButton, styles.socialButtonApple, pressed && styles.socialButtonPressed]}
            >
              {appleLoading ? (
                <Text style={[styles.socialButtonText, { color: "#FFFFFF" }]}>Loading…</Text>
              ) : (
                <>
                  <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
                  <Text style={[styles.socialButtonText, { color: "#FFFFFF" }]}>Continue with Apple</Text>
                </>
              )}
            </Pressable>
          )}

          <View style={styles.signUpContainer}>
            <Text variant="secondary" style={styles.signUpPrompt}>Don't have an account? </Text>
            <InlineAction onPress={() => navigation.navigate("SignUp")}>Sign Up</InlineAction>
          </View>
        </Section>
      </ScrollView>

      {/* Forgot Password Modal */}
      <Modal
        visible={forgotPasswordModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setForgotPasswordModalVisible(false);
          setResetEmail("");
          setResetEmailError("");
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { paddingBottom: SAFE_AREA_BOTTOM, backgroundColor: colors.canvas.background }]}>
            <View style={styles.modalHeader}>
              <Text variant="primary" style={styles.modalTitle}>Reset Password</Text>
              <TouchableOpacity
                onPress={() => {
                  setForgotPasswordModalVisible(false);
                  setResetEmail("");
                  setResetEmailError("");
                }}
                disabled={sendingReset}
              >
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <Section spacing="md" style={styles.modalBody}>
              <Text variant="secondary" style={styles.modalDescription}>
                Enter your email and we'll send a reset link.
              </Text>

              <View>
                <TextInput
                  placeholder="Email"
                  value={resetEmail}
                  onChangeText={handleResetEmailChange}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!sendingReset}
                  error={!!resetEmailError}
                />
                {resetEmailError && (
                  <Text variant="hint" style={styles.modalErrorText}>{resetEmailError}</Text>
                )}
              </View>

              <Button
                variant="primary"
                onPress={handleSendPasswordReset}
                loading={sendingReset}
                disabled={sendingReset}
              >
                Send Reset Email
              </Button>
            </Section>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xl,
  },
  content: {},
  header: {
    alignItems: "center",
    marginBottom: Spacing.lg,
    marginTop: Spacing.md,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  title: {
    fontFamily: Typography.fontFamily.semiBold,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  errorText: {
    marginTop: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  authErrorText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 14,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  forgotPasswordContainer: {
    alignItems: "flex-end",
    marginTop: -Spacing.sm,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    opacity: 0.4,
  },
  dividerText: {
    marginHorizontal: Spacing.md,
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Borders.radius.medium,
    height: 52,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  socialButtonApple: {
    backgroundColor: "#000000",
  },
  socialButtonPressed: {
    opacity: 0.7,
  },
  googleIcon: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.semiBold,
    color: "#4285F4",
  },
  socialButtonText: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.semiBold,
  },
  signUpContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.md,
  },
  signUpPrompt: {
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: Borders.radius.large,
    borderTopRightRadius: Borders.radius.large,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.semiBold,
  },
  modalBody: {
    paddingBottom: Spacing.md,
  },
  modalDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  modalErrorText: {
    marginTop: Spacing.xs,
    marginLeft: Spacing.xs,
  },
});

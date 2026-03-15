import React, { useState } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as AppleAuthentication from "expo-apple-authentication";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";
import { authService } from "../services/auth.service";
import { ErrorBanner } from "../components/ErrorBanner";
import Toast from "react-native-toast-message";
import { Colors, Borders, Spacing, Typography, PhysicalShift, useResponsive } from "../design";
import { createPhysicalShiftTransform } from "../design/styles";
import { Text } from "../components/primitives/Text";
import { TextInput } from "../components/inputs/TextInput";
import { Button } from "../components/actions/Button";
import { InlineAction } from "../components/actions/InlineAction";
import { Section } from "../components/containers/Section";
import { Card } from "../components/containers/Card";

type Props = NativeStackScreenProps<RootStackParamList, "SignIn">;

const GoogleIcon = () => (
  <Text variant="primary" style={styles.googleIcon}>G</Text>
);

/**
 * SocialButtonWrapper - Wraps social login buttons with Neobrutalist shadow effect
 * Matches the Button component's primaryWrapper structure for consistent styling
 */
const SocialButtonWrapper: React.FC<{
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}> = ({ children, onPress, disabled, loading }) => {
  const [isPressed, setIsPressed] = useState(false);

  return (
    <View style={styles.socialButtonWrapper}>
      {/* Static shadow block (background layer) - matches Button component */}
      <View style={styles.socialShadowBlock} />
      {/* Moving foreground (actual button) */}
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={() => setIsPressed(true)}
        onPressOut={() => setIsPressed(false)}
        onPress={onPress}
        disabled={disabled || loading}
        style={[
          styles.socialButton,
          createPhysicalShiftTransform(isPressed),
          // Don't apply opacity change - let OS handle visual feedback during popup
        ]}
      >
        {children}
      </TouchableOpacity>
    </View>
  );
};

export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { horizontalPadding } = useResponsive();
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
      // Don't show alert for user cancellation
      if (!error.message?.includes("cancelled")) {
        Toast.show({
          type: "error",
          text1: "Failed to sign in with Apple. Please try again.",
        });
      }
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: horizontalPadding,
          },
        ]}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        <Section spacing="md" style={styles.content}>
          {/* Spacer to push content down when keyboard is OFF */}
          

            <View style={styles.header}>
              <Text variant="primary" style={styles.title}>Welcome Back</Text>
              <Text variant="secondary" style={styles.subtitle}>Sign in to your account</Text>
            </View>

            {/* Auth Error (e.g. email not verified) - Bold Red */}
            {authError && (
              <Text variant="hint" style={styles.authErrorText}>{authError}</Text>
            )}

            {/* Global Error Banner */}
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

            <Button
              variant="primary"
              onPress={handleSignIn}
              loading={loading}
              disabled={loading}
            >
              Sign In
            </Button>
          </Section>

          {/* If the screen is small, the OR divider and Social Buttons 
              will simply move below the fold, which is fine! */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text variant="hint" style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <SocialButtonWrapper
            onPress={handleGoogleSignIn}
            disabled={googleLoading || loading || appleLoading}
            loading={googleLoading}
          >
            {googleLoading ? (
              <Text variant="primary">Loading...</Text>
            ) : (
              <>
                <GoogleIcon />
                <Text variant="primary" style={styles.socialButtonText}>
                  Continue with Google
                </Text>
              </>
            )}
          </SocialButtonWrapper>

          {Platform.OS === "ios" && (
            <SocialButtonWrapper
              onPress={handleAppleSignIn}
              disabled={appleLoading || loading || googleLoading}
              loading={appleLoading}
            >
              {appleLoading ? (
                <Text variant="primary">Loading...</Text>
              ) : (
                <View style={styles.appleButtonContent}>
                  <Ionicons name="logo-apple" size={20} color={Colors.text.primary} />
                  <Text variant="primary" style={styles.socialButtonText}>
                    Continue with Apple
                  </Text>
                </View>
              )}
            </SocialButtonWrapper>
          )}

          <View style={styles.signUpContainer}>
            <Text variant="secondary" style={styles.signUpPrompt}>
              Don't have an account?{" "}
            </Text>
            <InlineAction onPress={() => navigation.navigate("SignUp")}>
              Sign Up
            </InlineAction>
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
          {/* Modal Content Wrapper with Physical Shift */}
          <View style={styles.modalContentWrapper}>
            {/* Physical Shift Shadow Block */}
            <View style={styles.modalShadowBlock} />
            
            {/* Modal Content */}
            <Card variant="flat" style={styles.modalContent}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderContent}>
                  <View style={styles.modalIconContainer}>
                    <Ionicons name="mail-outline" size={20} color={Colors.interaction.primary} />
                  </View>
                  <Text variant="primary" style={styles.modalTitle}>Reset Password</Text>
                </View>
                {/* Chunky Close Button */}
                <TouchableOpacity
                  onPress={() => {
                    setForgotPasswordModalVisible(false);
                    setResetEmail("");
                    setResetEmailError("");
                  }}
                  disabled={sendingReset}
                  activeOpacity={1}
                  style={styles.modalCloseButton}
                >
                  <Ionicons name="close" size={18} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              <Section spacing="md" style={styles.modalBody}>
                <Text variant="secondary" style={styles.modalDescription}>
                  Enter your email address and we'll send you a link to reset your password.
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
                    <Text variant="hint" style={styles.modalErrorText}>
                      {resetEmailError}
                    </Text>
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
            </Card>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas.background,
  },
  scrollContent: {
    flexGrow: 1, // Crucial: allows the spacers to expand
    justifyContent: "center", // Center content vertically
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xl,
  },
  content: {
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.lg,
    marginTop: Spacing.md,
  },
  title: {
    fontSize: 28, // Slightly smaller to prevent overflow
    fontFamily: Typography.fontFamily.semiBold,
    textAlign: "center",
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
  },
  errorText: {
    marginTop: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  authErrorText: {
    color: Colors.interaction.error,
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
    marginVertical: Spacing.md, // Reduced from lg to md
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.text.secondary,
    opacity: 0.3,
  },
  dividerText: {
    marginHorizontal: Spacing.md,
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
    textTransform: "uppercase",
  },
  // Social Button Wrapper - Matches Button component's primaryWrapper structure
  socialButtonWrapper: {
    marginBottom: Spacing.md + PhysicalShift.offset.y,
    marginRight: PhysicalShift.offset.x,
  },
  socialShadowBlock: {
    // Static shadow block (background layer) - stays in place
    position: "absolute",
    top: PhysicalShift.offset.y,
    left: PhysicalShift.offset.x,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.text.primary, // Charcoal shadow
    borderRadius: Borders.radius.medium,
  },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.canvas.background, // Clean white for social
    borderWidth: Borders.width,
    borderColor: Colors.text.primary, // Black border
    borderRadius: Borders.radius.medium,
    height: 56, // Standard Neobrutalist height
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  appleButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  googleIcon: {
    fontSize: 22,
    fontFamily: Typography.fontFamily.semiBold,
    color: "#4285F4",
  },
  socialButtonText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
  },
  buttonDisabled: {
    opacity: 0.5,
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
    backgroundColor: "rgba(0, 0, 0, 0.5)", // Lighter overlay for high-energy Neobrutalist vibe
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalContentWrapper: {
    width: "95%",
    marginBottom: PhysicalShift.offset.y,
    marginRight: PhysicalShift.offset.x,
  },
  modalShadowBlock: {
    // Static shadow block (background layer) - Neobrutalist physical shift
    position: "absolute",
    top: PhysicalShift.offset.y,
    left: PhysicalShift.offset.x,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.text.primary, // Charcoal shadow
    borderRadius: Borders.radius.medium,
  },
  modalContent: {
    width: "100%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: Borders.width,
    borderBottomColor: Colors.text.primary,
  },
  modalHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  modalIconContainer: {
    width: 32,
    height: 32,
    borderRadius: Borders.radius.small,
    backgroundColor: "rgba(16, 185, 129, 0.15)", // Mint with 15% opacity
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.semiBold,
    flex: 1,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBody: {
    padding: Spacing.lg,
    paddingTop: Spacing.md,
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

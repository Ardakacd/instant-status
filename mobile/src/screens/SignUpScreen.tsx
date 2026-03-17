import React, { useState } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";
import { ErrorBanner } from "../components/ErrorBanner";
import Toast from "react-native-toast-message";
import { Colors, Borders, Spacing, Typography, PhysicalShift, useResponsive } from "../design";
import { createPhysicalShiftTransform } from "../design/styles";
import { Text } from "../components/primitives/Text";
import { TextInput } from "../components/inputs/TextInput";
import { Button } from "../components/actions/Button";
import { InlineAction } from "../components/actions/InlineAction";
import { Section } from "../components/containers/Section";

type Props = NativeStackScreenProps<RootStackParamList, "SignUp">;

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
        ]}
      >
        {children}
      </TouchableOpacity>
    </View>
  );
};

export default function SignUpScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { horizontalPadding, isSmallScreen } = useResponsive();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const { signUp, signInWithGoogle, signInWithApple, authError, clearAuthError } = useAuth();

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

  const validateForm = (): boolean => {
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
    } else if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      isValid = false;
    }

    return isValid;
  };

  const handleSignUp = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setGlobalError("");
    try {
      await signUp(email.trim(), password);
    } catch (error: any) {
      const errorMessage =
        error.message || error.originalError?.message || "Failed to sign up";
      setGlobalError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      if (!error.message?.includes("cancelled")) {
        Toast.show({
          type: "error",
          text1: error.message || "Failed to sign in with Google. Please try again.",
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
      if (!error.message?.includes("cancelled")) {
        Toast.show({
          type: "error",
          text1: error.message || "Failed to sign in with Apple. Please try again.",
        });
      }
    } finally {
      setAppleLoading(false);
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
          <View style={styles.header}>
            <Text variant="primary" style={[styles.title, isSmallScreen && { fontSize: 24, lineHeight: 30 }]}>Create Account</Text>
            <Text variant="secondary" style={styles.subtitle}>Sign up to get started</Text>
          </View>

          {/* Auth Error (e.g. email not verified) - Bold Red */}
          {authError && (
            <Text variant="hint" style={styles.authErrorText}>{authError}</Text>
          )}

          {/* Global Error Banner */}
          {globalError && <ErrorBanner message={globalError} />}

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
                placeholder="Password (min 8 characters)"
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

            <Button
              variant="primary"
              onPress={handleSignUp}
              loading={loading}
              disabled={loading}
            >
              Sign Up
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

          <View style={styles.signInContainer}>
            <Text variant="secondary" style={styles.signInPrompt}>
              Already have an account?{" "}
            </Text>
            <InlineAction onPress={() => navigation.navigate("SignIn")}>
              Sign In
            </InlineAction>
          </View>

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
    fontSize: 28,
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
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: Spacing.md,
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
  signInContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.md,
  },
  signInPrompt: {
    fontSize: 14,
  },
});

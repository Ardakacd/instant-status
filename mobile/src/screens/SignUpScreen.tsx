import React from "react";
import {
  View,
  Pressable,
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
import { Colors, Borders, Spacing, Typography, useResponsive } from "../design";
import { Text } from "../components/primitives/Text";
import { TextInput } from "../components/inputs/TextInput";
import { Button } from "../components/actions/Button";
import { InlineAction } from "../components/actions/InlineAction";
import { Section } from "../components/containers/Section";

type Props = NativeStackScreenProps<RootStackParamList, "SignUp">;

export default function SignUpScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { horizontalPadding, fs } = useResponsive();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [emailError, setEmailError] = React.useState("");
  const [passwordError, setPasswordError] = React.useState("");
  const [globalError, setGlobalError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [appleLoading, setAppleLoading] = React.useState(false);
  const {
    signUp,
    signInWithGoogle,
    signInWithApple,
    authError,
    clearAuthError,
  } = useAuth();

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
          text1:
            error.message || "Failed to sign in with Google. Please try again.",
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
        text1:
          error.message || "Failed to sign in with Apple. Please try again.",
      });
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
            <View style={styles.logoCircle}>
              <Ionicons name="radio-outline" size={28} color="#FFFFFF" />
            </View>
            <Text
              variant="primary"
              style={[styles.title, { fontSize: fs(28), lineHeight: fs(34) }]}
            >
              Create Account
            </Text>
            <Text variant="secondary" style={styles.subtitle}>
              Sign up to get started
            </Text>
          </View>

          {authError && (
            <Text variant="hint" style={styles.authErrorText}>
              {authError}
            </Text>
          )}
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
                <Text variant="hint" style={styles.errorText}>
                  {emailError}
                </Text>
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
                <Text variant="hint" style={styles.errorText}>
                  {passwordError}
                </Text>
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

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google */}
          <Pressable
            onPress={handleGoogleSignIn}
            disabled={googleLoading || loading || appleLoading}
            style={({ pressed }) => [
              styles.socialButton,
              pressed && styles.socialButtonPressed,
            ]}
          >
            {googleLoading ? (
              <Text variant="secondary" style={styles.socialButtonText}>
                Loading…
              </Text>
            ) : (
              <>
                <Text style={styles.googleIcon}>G</Text>
                <Text variant="primary" style={styles.socialButtonText}>
                  Continue with Google
                </Text>
              </>
            )}
          </Pressable>

          {/* Apple (iOS only) */}
          {Platform.OS === "ios" && (
            <Pressable
              onPress={handleAppleSignIn}
              disabled={appleLoading || loading || googleLoading}
              style={({ pressed }) => [
                styles.socialButton,
                styles.socialButtonApple,
                pressed && styles.socialButtonPressed,
              ]}
            >
              {appleLoading ? (
                <Text style={[styles.socialButtonText, { color: "#FFFFFF" }]}>
                  Loading…
                </Text>
              ) : (
                <>
                  <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
                  <Text style={[styles.socialButtonText, { color: "#FFFFFF" }]}>
                    Continue with Apple
                  </Text>
                </>
              )}
            </Pressable>
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
    backgroundColor: Colors.interaction.primary,
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
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.text.secondary,
    opacity: 0.4,
  },
  dividerText: {
    marginHorizontal: Spacing.md,
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
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

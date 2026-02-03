import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "../contexts/AuthContext";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";
import { ErrorBanner } from "../components/ErrorBanner";
import Toast from "react-native-toast-message";

type Props = NativeStackScreenProps<RootStackParamList, "SignUp">;

const GoogleIcon = () => <Text style={styles.googleIcon}>G</Text>;

export default function SignUpScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const { signUp, signInWithGoogle, signInWithApple } = useAuth();

  const handleEmailChange = (text: string) => {
    setEmail(text);
    if (emailError) setEmailError(""); // Clear error when user starts typing
    if (globalError) setGlobalError(""); // Clear global error when user starts typing
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    if (passwordError) setPasswordError(""); // Clear error when user starts typing
    if (globalError) setGlobalError(""); // Clear global error when user starts typing
  };

  const validateForm = (): boolean => {
    let isValid = true;

    // Validate email
    if (!email.trim()) {
      setEmailError("Email is required");
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError("Please enter a valid email address");
      isValid = false;
    }

    // Validate password
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
    setGlobalError(""); // Clear any previous errors
    try {
      await signUp(email.trim(), password);
    } catch (error: any) {
      const errorMessage =
        error.message || error.originalError?.message || "Failed to sign up";
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
      // Don't show alert for user cancellation
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
    <View style={styles.container}>
      <Text style={styles.title}>Instant Status</Text>
      <Text style={styles.subtitle}>Create your account</Text>

      {/* Global Error Banner */}
      {globalError ? (
        <ErrorBanner
          message={globalError}
          onDismiss={() => setGlobalError("")}
        />
      ) : null}

      <View>
        <TextInput
          style={[styles.input, emailError && styles.inputError]}
          placeholder="Email"
          value={email}
          onChangeText={handleEmailChange}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
      </View>
      <View>
        <TextInput
          style={[styles.input, passwordError && styles.inputError]}
          placeholder="Password (min 8 characters)"
          value={password}
          onChangeText={handlePasswordChange}
          secureTextEntry
          autoCapitalize="none"
        />
        {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
      </View>
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSignUp}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign Up</Text>
        )}
      </TouchableOpacity>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity
        style={[styles.googleButton, googleLoading && styles.buttonDisabled]}
        onPress={handleGoogleSignIn}
        disabled={googleLoading || loading || appleLoading}
      >
        {googleLoading ? (
          <ActivityIndicator color="#333" />
        ) : (
          <>
            <GoogleIcon />
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </>
        )}
      </TouchableOpacity>

      {Platform.OS === "ios" && !appleLoading && !googleLoading && !loading && (
        <View style={styles.appleButtonContainer}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={
              AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
            }
            buttonStyle={
              AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={8}
            style={styles.appleButton}
            onPress={handleAppleSignIn}
          />
        </View>
      )}
      {Platform.OS === "ios" && appleLoading && (
        <View style={[styles.appleButtonContainer, styles.appleButton]}>
          <ActivityIndicator color="#fff" />
        </View>
      )}

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => navigation.navigate("SignIn")}
      >
        <Text style={styles.linkText}>Already have an account? Sign In</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
    color: "#333",
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 40,
    color: "#666",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    marginBottom: 4,
    backgroundColor: "#f9f9f9",
  },
  inputError: {
    borderColor: "#EF4444",
    borderWidth: 1,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 12,
    marginBottom: 16,
    marginLeft: 4,
  },
  button: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  linkButton: {
    padding: 12,
    alignItems: "center",
  },
  linkText: {
    color: "#007AFF",
    fontSize: 14,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#ddd",
  },
  dividerText: {
    marginHorizontal: 16,
    color: "#666",
    fontSize: 14,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#4285F4",
    marginRight: 12,
  },
  googleButtonText: {
    color: "#333",
    fontSize: 16,
    fontWeight: "600",
  },
  appleButtonContainer: {
    marginBottom: 12,
  },
  appleButton: {
    width: "100%",
    height: 50,
  },
});

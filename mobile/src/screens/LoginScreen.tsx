import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";
import { authService } from "../services/auth.service";
import { ErrorBanner } from "../components/ErrorBanner";
import Toast from "react-native-toast-message";

type Props = NativeStackScreenProps<RootStackParamList, "SignIn">;

const GoogleIcon = () => <Text style={styles.googleIcon}>G</Text>;

export default function LoginScreen({ navigation }: Props) {
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
  const { signIn, signInWithGoogle, signInWithApple } = useAuth();

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
    <View style={styles.container}>
      <Text style={styles.title}>Welcome Back</Text>
      <Text style={styles.subtitle}>Sign in to your account</Text>

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
          autoFocus
        />
        {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
      </View>
      <View>
        <TextInput
          style={[styles.input, passwordError && styles.inputError]}
          placeholder="Password"
          value={password}
          onChangeText={handlePasswordChange}
          secureTextEntry
          autoCapitalize="none"
        />
        {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
      </View>
      <TouchableOpacity
        style={styles.forgotPasswordButton}
        onPress={handleForgotPassword}
      >
        <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSignIn}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign In</Text>
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
        onPress={() => navigation.navigate("SignUp")}
      >
        <Text style={styles.linkText}>Don't have an account? Sign Up</Text>
      </TouchableOpacity>

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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reset Password</Text>
              <TouchableOpacity
                onPress={() => {
                  setForgotPasswordModalVisible(false);
                  setResetEmail("");
                  setResetEmailError("");
                }}
                disabled={sendingReset}
              >
                <Ionicons name="close" size={24} color="#111827" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalDescription}>
                Enter your email address and we'll send you a link to reset your
                password.
              </Text>

              <View>
                <TextInput
                  style={[styles.modalInput, resetEmailError && styles.modalInputError]}
                  placeholder="Email"
                  value={resetEmail}
                  onChangeText={handleResetEmailChange}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoFocus
                  editable={!sendingReset}
                />
                {resetEmailError ? <Text style={styles.modalErrorText}>{resetEmailError}</Text> : null}
              </View>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  sendingReset && styles.modalButtonDisabled,
                ]}
                onPress={handleSendPasswordReset}
                disabled={sendingReset}
              >
                {sendingReset ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalButtonText}>Send Reset Email</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setForgotPasswordModalVisible(false);
                  setResetEmail("");
                }}
                disabled={sendingReset}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  label: {
    fontSize: 16,
    marginBottom: 8,
    color: "#333",
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
  forgotPasswordButton: {
    alignSelf: "flex-end",
    marginBottom: 20,
    marginTop: -10,
  },
  forgotPasswordText: {
    color: "#007AFF",
    fontSize: 14,
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    width: "90%",
    maxWidth: 400,
    padding: 0,
    // No shadows, no elevation - using physical shift transform instead
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
  },
  modalBody: {
    padding: 20,
  },
  modalDescription: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 20,
    lineHeight: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    backgroundColor: "#F9FAFB",
    marginBottom: 4,
  },
  modalInputError: {
    borderColor: "#EF4444",
    borderWidth: 1,
  },
  modalErrorText: {
    color: "#EF4444",
    fontSize: 12,
    marginBottom: 16,
    marginLeft: 4,
  },
  modalButton: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  modalButtonDisabled: {
    opacity: 0.6,
  },
  modalButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  modalCancelButton: {
    padding: 12,
    alignItems: "center",
  },
  modalCancelButtonText: {
    color: "#6B7280",
    fontSize: 14,
  },
});

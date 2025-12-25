import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { authService } from "../services/auth.service";
import { auth } from "../config/firebase";
import { useAuth } from "../contexts/AuthContext";

export default function EmailVerificationScreen() {
  const { checkEmailVerification, logout } = useAuth();
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);

  // Listen for auth state changes to automatically navigate when verified
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async () => {
      await checkEmailVerification();
    });

    return unsubscribe;
  }, [checkEmailVerification]);

  const handleResendVerification = async () => {
    setSending(true);
    try {
      await authService.sendEmailVerification();
      Alert.alert(
        "Verification Email Sent",
        "Please check your email and click the verification link to verify your account."
      );
    } catch (error: any) {
      Alert.alert(
        "Error",
        error.message || "Failed to send verification email"
      );
    } finally {
      setSending(false);
    }
  };

  const checkVerificationStatus = async () => {
    setChecking(true);
    try {
      await checkEmailVerification();
      // Navigation will happen automatically if email is verified
    } catch (error: any) {
      Alert.alert("Error", "Failed to check verification status");
    } finally {
      setChecking(false);
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
            } catch (error) {
              Alert.alert("Error", "Failed to logout");
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
        <Ionicons name="arrow-back" size={24} color="#111827" />
        <Text style={styles.backButtonText}>Go Back</Text>
      </TouchableOpacity>

      <View style={styles.iconContainer}>
        <Ionicons name="mail-outline" size={80} color="#007AFF" />
      </View>

      <Text style={styles.title}>Verify Your Email</Text>
      <Text style={styles.subtitle}>
        We've sent a verification email to your inbox. Please check your email
        and click the verification link to continue.
      </Text>

      <TouchableOpacity
        style={[styles.button, sending && styles.buttonDisabled]}
        onPress={handleResendVerification}
        disabled={sending}
      >
        {sending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons
              name="mail"
              size={20}
              color="#fff"
              style={styles.buttonIcon}
            />
            <Text style={styles.buttonText}>Resend Verification Email</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.checkButton, checking && styles.buttonDisabled]}
        onPress={checkVerificationStatus}
        disabled={checking}
      >
        {checking ? (
          <ActivityIndicator color="#007AFF" />
        ) : (
          <>
            <Ionicons
              name="refresh"
              size={20}
              color="#007AFF"
              style={styles.buttonIcon}
            />
            <Text style={styles.checkButtonText}>I've Verified My Email</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  backButton: {
    position: "absolute",
    top: 60,
    left: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 1,
  },
  backButtonText: {
    fontSize: 16,
    color: "#111827",
    fontWeight: "500",
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
    color: "#111827",
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 32,
    color: "#6B7280",
    lineHeight: 24,
  },
  button: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "center",
  },
  checkButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#007AFF",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  checkButtonText: {
    color: "#007AFF",
    fontSize: 16,
    fontWeight: "600",
  },
});

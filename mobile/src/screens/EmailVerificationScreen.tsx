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
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";
import { authService } from "../services/auth.service";
import { auth } from "../config/firebase";
import { useAuth } from "../contexts/AuthContext";
import { RootStackParamList } from "../../App";
import Toast from "react-native-toast-message";

type Props = NativeStackScreenProps<RootStackParamList, "EmailVerification">;

export default function EmailVerificationScreen({ route }: Props) {
  const { checkEmailVerification, logout, authError } = useAuth();
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [hasHandledVerification, setHasHandledVerification] = useState(false);

  // Handle email verification link (oobCode from universal link)
  useEffect(() => {
    if (hasHandledVerification) return;

    const { oobCode, mode } = route.params || {};
    
    // Also try to get params from URL if route.params is empty (deep link case)
    const getParamsFromURL = async () => {
      const url = await Linking.getInitialURL();
      if (url && (!oobCode || !mode)) {
        const parsed = Linking.parse(url);
        const queryParams = parsed.queryParams || {};
        return {
          mode: mode || queryParams.mode as string,
          oobCode: oobCode || queryParams.oobCode as string,
        };
      }
      return { mode, oobCode };
    };

    getParamsFromURL().then(({ mode: finalMode, oobCode: finalOobCode }) => {
      if (finalMode === "verifyEmail") {
        setHasHandledVerification(true);
        if (finalOobCode) {
          handleVerifyEmail(finalOobCode);
        } else {
          handleCheckVerificationOnly();
        }
      }
    });
  }, [route.params, hasHandledVerification]);

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


  // Listen for auth state changes to check verification status
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async () => {
      await checkEmailVerification();
    });

    return unsubscribe;
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
      return; // Prevent spam clicking
    }

    setSending(true);
    try {
      await authService.sendEmailVerification();
      setResendCooldown(60); // Set 60 second cooldown
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
      <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
        <Ionicons name="arrow-back" size={24} color="#111827" />
        <Text style={styles.backButtonText}>Go Back</Text>
      </TouchableOpacity>

      <View style={styles.iconContainer}>
        <Ionicons name="mail-outline" size={80} color="#007AFF" />
      </View>

      <Text style={styles.title}>Verify Your Email</Text>
      {authError && (
        <Text style={styles.authErrorText}>{authError}</Text>
      )}
      <Text style={styles.subtitle}>
        {verifying
          ? "Verifying your email..."
          : "We've sent a verification email. Click the link in the email to automatically verify your account. It may take a minute to arrive, check your spam folder if needed."}
      </Text>

      {verifying && (
        <View style={styles.verifyingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.button,
          (sending || resendCooldown > 0) && styles.buttonDisabled,
        ]}
        onPress={handleResendVerification}
        disabled={sending || resendCooldown > 0}
      >
        {sending ? (
          <ActivityIndicator color="#fff" />
        ) : resendCooldown > 0 ? (
          <Text style={styles.buttonText}>Resend in {resendCooldown}s</Text>
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
  authErrorText: {
    fontSize: 14,
    fontFamily: "Inter-SemiBold",
    color: "#FF5C5C",
    textAlign: "center",
    marginBottom: 16,
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
  verifyingContainer: {
    marginTop: 20,
    marginBottom: 20,
    alignItems: "center",
  },
});

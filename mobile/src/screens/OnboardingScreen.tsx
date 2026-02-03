import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { userService } from "../services/user.service";
import { ErrorBanner } from "../components/ErrorBanner";

export default function OnboardingScreen() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstNameError, setFirstNameError] = useState("");
  const [lastNameError, setLastNameError] = useState("");
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading] = useState(false);
  const { completeOnboarding, refreshUser } = useAuth();

  const handleFirstNameChange = (text: string) => {
    setFirstName(text);
    if (firstNameError) setFirstNameError(""); // Clear error when user starts typing
    if (globalError) setGlobalError(""); // Clear global error when user starts typing
  };

  const handleLastNameChange = (text: string) => {
    setLastName(text);
    if (lastNameError) setLastNameError(""); // Clear error when user starts typing
    if (globalError) setGlobalError(""); // Clear global error when user starts typing
  };

  const validateForm = (): boolean => {
    let isValid = true;

    if (!firstName.trim()) {
      setFirstNameError("First name is required");
      isValid = false;
    }

    if (!lastName.trim()) {
      setLastNameError("Last name is required");
      isValid = false;
    }

    return isValid;
  };

  const handleComplete = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setGlobalError(""); // Clear any previous errors
    try {
      await userService.updateMe({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      
      await refreshUser();
      await completeOnboarding();
    } catch (error: any) {
      console.error("Error completing onboarding:", error);
      // Show server errors as global error banner (not validation errors)
      setGlobalError(error.message || "Failed to save your information. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome!</Text>
      <Text style={styles.subtitle}>
        Let's get started by telling us your name
      </Text>

      {/* Global Error Banner */}
      {globalError ? (
        <ErrorBanner
          message={globalError}
          onDismiss={() => setGlobalError("")}
        />
      ) : null}

      <View>
        <TextInput
          style={[styles.input, firstNameError && styles.inputError]}
          placeholder="First Name"
          value={firstName}
          onChangeText={handleFirstNameChange}
          autoCapitalize="words"
        />
        {firstNameError ? <Text style={styles.errorText}>{firstNameError}</Text> : null}
      </View>
      <View>
        <TextInput
          style={[styles.input, lastNameError && styles.inputError]}
          placeholder="Last Name"
          value={lastName}
          onChangeText={handleLastNameChange}
          autoCapitalize="words"
        />
        {lastNameError ? <Text style={styles.errorText}>{lastNameError}</Text> : null}
      </View>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleComplete}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Continue</Text>
        )}
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
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});


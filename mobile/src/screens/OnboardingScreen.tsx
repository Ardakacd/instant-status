import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { userService } from "../services/user.service";
import { ErrorBanner } from "../components/ErrorBanner";
import { Colors, Spacing, Typography } from "../design";
import { Text } from "../components/primitives/Text";
import { TextInput } from "../components/inputs/TextInput";
import { Button } from "../components/actions/Button";
import { Section } from "../components/containers/Section";

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstNameError, setFirstNameError] = useState("");
  const [lastNameError, setLastNameError] = useState("");
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading] = useState(false);
  const { refreshUser } = useAuth();

  const handleFirstNameChange = (text: string) => {
    setFirstName(text);
    if (firstNameError) setFirstNameError("");
    if (globalError) setGlobalError("");
  };

  const handleLastNameChange = (text: string) => {
    setLastName(text);
    if (lastNameError) setLastNameError("");
    if (globalError) setGlobalError("");
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
    setGlobalError("");
    try {
      await userService.updateMe({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      await refreshUser();
    } catch (error: any) {
      console.error("Error completing onboarding:", error);
      setGlobalError(error.message || "Failed to save your information. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        <Section spacing="md" style={styles.content}>
          <View style={styles.header}>
            <Text variant="primary" style={styles.title}>Welcome!</Text>
            <Text variant="secondary" style={styles.subtitle}>
              Let's get started by telling us your name
            </Text>
          </View>

          {/* Global Error Banner */}
          {globalError && (
            <ErrorBanner message={globalError} />
          )}

          <Section spacing="sm">
            <View>
              <TextInput
                placeholder="First Name"
                value={firstName}
                onChangeText={handleFirstNameChange}
                autoCapitalize="words"
                editable={!loading}
                error={!!firstNameError}
              />
              {firstNameError && (
                <Text variant="hint" style={styles.errorText}>{firstNameError}</Text>
              )}
            </View>

            <View>
              <TextInput
                placeholder="Last Name"
                value={lastName}
                onChangeText={handleLastNameChange}
                autoCapitalize="words"
                editable={!loading}
                error={!!lastNameError}
              />
              {lastNameError && (
                <Text variant="hint" style={styles.errorText}>{lastNameError}</Text>
              )}
            </View>

            <Button
              variant="primary"
              onPress={handleComplete}
              loading={loading}
              disabled={loading}
            >
              Continue
            </Button>
          </Section>
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
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl    
    
  },
  content: {
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.lg,
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
});

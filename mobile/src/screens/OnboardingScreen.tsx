import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { userService } from "../services/user.service";
import { ErrorBanner } from "../components/ErrorBanner";
import { Colors, Spacing, Typography, useResponsive, useColors } from "../design";
import { Text } from "../components/primitives/Text";
import { TextInput } from "../components/inputs/TextInput";
import { Button } from "../components/actions/Button";
import { Section } from "../components/containers/Section";

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { horizontalPadding, fs } = useResponsive();
  const colors = useColors();
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
    } else if (firstName.trim().length > 50) {
      setFirstNameError("First name must be 50 characters or less");
      isValid = false;
    }

    if (!lastName.trim()) {
      setLastNameError("Last name is required");
      isValid = false;
    } else if (lastName.trim().length > 50) {
      setLastNameError("Last name must be 50 characters or less");
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
      setGlobalError(error.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
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
              One last step
            </Text>
            <Text variant="secondary" style={styles.subtitle}>
              What should your friends call you?
            </Text>
          </View>

          {globalError && <ErrorBanner message={globalError} />}

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
              Get Started
            </Button>
          </Section>

          {/* Feature hints */}
          <View style={styles.hints}>
            {[
              { icon: "radio-outline" as const, text: "Share your status in real-time" },
              { icon: "people-outline" as const, text: "See what your friends are up to" },
              { icon: "phone-portrait-outline" as const, text: "Widget on your home screen" },
            ].map(({ icon, text }) => (
              <View key={text} style={styles.hintRow}>
                <View style={[styles.hintIcon, { backgroundColor: colors.interaction.primary + "15" }]}>
                  <Ionicons name={icon} size={16} color={colors.interaction.primary} />
                </View>
                <Text variant="secondary" style={styles.hintText}>{text}</Text>
              </View>
            ))}
          </View>
        </Section>
      </ScrollView>
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
  hints: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  hintIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  hintText: {
    fontSize: 14,
    flex: 1,
  },
});

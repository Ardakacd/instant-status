/**
 * Text Input Component
 *
 * Used for:
 * - Status text
 * - Sign-up/sign-in
 * - Friend identifier
 *
 * Rules:
 * - Flat
 * - Border only
 * - No shadows
 * - No icons inside inputs (exception: password visibility toggle)
 * - Inputs should feel neutral and safe
 */

import React, { useState } from "react";
import {
  TextInput as RNTextInput,
  TextInputProps as RNTextInputProps,
  StyleSheet,
  View,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Borders, Spacing, Typography } from "../../design/tokens";
import { useResponsive, useColors } from "../../design";

export interface TextInputProps extends RNTextInputProps {
  error?: boolean;
}

export const TextInput: React.FC<TextInputProps> = ({
  error = false,
  style,
  editable = true,
  secureTextEntry,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const { fs } = useResponsive();
  const colors = useColors();

  const borderColor = error
    ? colors.interaction.error
    : isFocused
      ? colors.interaction.primary
      : !editable
        ? colors.interaction.disabled
        : colors.text.secondary + "40";

  const textColor = !editable
    ? colors.interaction.disabled
    : colors.text.primary;

  const backgroundColor = colors.canvas.background;

  const placeholderTextColor = colors.text.secondary;

  const isPassword = secureTextEntry != null && secureTextEntry;

  return (
    <View
      style={[
        styles.inputBase,
        { backgroundColor, borderColor },
        isPassword && styles.inputRow,
        style,
      ]}
    >
      <RNTextInput
        style={[
          styles.textInput,
          { fontSize: fs(16), color: textColor },
          isPassword && styles.textInputWithToggle,
        ]}
        placeholderTextColor={placeholderTextColor}
        selectionColor={colors.interaction.primary}
        cursorColor={colors.interaction.primary}
        underlineColorAndroid="transparent"
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        editable={editable}
        secureTextEntry={isPassword && !passwordVisible}
        {...props}
      />
      {isPassword && (
        <TouchableOpacity
          onPress={() => setPasswordVisible((v) => !v)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
          accessibilityRole="button"
        >
          <Ionicons
            name={passwordVisible ? "eye-off-outline" : "eye-outline"}
            size={20}
            color={colors.text.secondary}
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  inputBase: {
    borderWidth: Borders.width,
    borderRadius: Borders.radius.medium,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  textInput: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 16,
    textAlignVertical: "center",
    padding: 0,
    margin: 0,
  },
  textInputWithToggle: {
    flex: 1,
  },
});

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
 * - No icons inside inputs
 * - Inputs should feel neutral and safe
 */

import React, { useState } from 'react';
import { TextInput as RNTextInput, TextInputProps as RNTextInputProps, StyleSheet } from 'react-native';
import { Colors, Borders, Spacing, Typography, useResponsive } from '../../design';

export interface TextInputProps extends RNTextInputProps {
  error?: boolean;
}

export const TextInput: React.FC<TextInputProps> = ({
  error = false,
  style,
  editable = true,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const { fs } = useResponsive();

  return (
    <RNTextInput
      style={[
        styles.input,
        { fontSize: fs(16) },
        isFocused && styles.inputFocused, // Add focus state
        error && styles.inputError,
        !editable && styles.inputDisabled,
        style,
      ]}
      placeholderTextColor={Colors.text.secondary}
      selectionColor={Colors.interaction.primary} // Mint cursor
      underlineColorAndroid="transparent" // Remove default Android underline
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      editable={editable}
      {...props}
    />
  );
};

const styles = StyleSheet.create({
  input: {
    borderWidth: Borders.width,
    borderColor: Colors.text.secondary, // Muted charcoal
    borderRadius: Borders.radius.medium,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontFamily: Typography.fontFamily.regular,
    fontSize: 16,
    color: Colors.text.primary,
    backgroundColor: Colors.canvas.background,
    textAlignVertical: 'center', // Better vertical centering on Android
    // Flat, border only, no shadows
  },
  inputFocused: {
    borderColor: Colors.interaction.primary,
  },
  inputError: {
    borderColor: Colors.interaction.error,
  },
  inputDisabled: {
    borderColor: Colors.interaction.disabled,
    color: Colors.interaction.disabled,
    backgroundColor: Colors.canvas.background,
  },
});


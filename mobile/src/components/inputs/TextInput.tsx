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
import { Borders, Spacing, Typography } from '../../design/tokens';
import { useResponsive, useColors } from '../../design';

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
  const colors = useColors();

  const borderColor = error
    ? colors.interaction.error
    : isFocused
    ? colors.interaction.primary
    : !editable
    ? colors.interaction.disabled
    : colors.text.secondary + '40';

  const textColor = !editable ? colors.interaction.disabled : colors.text.primary;

  return (
    <RNTextInput
      style={[
        styles.inputBase,
        { fontSize: fs(16) },
        {
          backgroundColor: colors.canvas.background,
          borderColor,
          color: textColor,
        },
        style,
      ]}
      placeholderTextColor={colors.text.secondary}
      selectionColor={colors.interaction.primary}
      underlineColorAndroid="transparent"
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      editable={editable}
      {...props}
    />
  );
};

const styles = StyleSheet.create({
  inputBase: {
    borderWidth: Borders.width,
    borderRadius: Borders.radius.medium,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontFamily: Typography.fontFamily.regular,
    fontSize: 16,
    textAlignVertical: 'center',
  },
});

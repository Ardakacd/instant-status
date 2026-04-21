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
import {
  Platform,
  TextInput as RNTextInput,
  TextInputProps as RNTextInputProps,
  StyleSheet,
} from 'react-native';
import { Borders, Spacing, Typography, lightColors } from '../../design/tokens';
import { useResponsive, useColors, useTheme } from '../../design';

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
  const { fs } = useResponsive();
  const colors = useColors();
  const { isDark } = useTheme();

  // Android + dark theme: obscured password glyphs often render as dark pixels; on a dark
  // canvas background they disappear. Use a light input surface so typed characters stay visible.
  const androidPasswordDarkSurface =
    Platform.OS === 'android' && !!secureTextEntry && isDark;

  const borderColor = error
    ? colors.interaction.error
    : isFocused
    ? colors.interaction.primary
    : !editable
    ? colors.interaction.disabled
    : colors.text.secondary + '40';

  const textColor = !editable
    ? colors.interaction.disabled
    : androidPasswordDarkSurface
    ? lightColors.text.primary
    : colors.text.primary;

  const backgroundColor = androidPasswordDarkSurface
    ? lightColors.canvas.background
    : colors.canvas.background;

  const placeholderTextColor = androidPasswordDarkSurface
    ? lightColors.text.secondary
    : colors.text.secondary;

  return (
    <RNTextInput
      style={[
        styles.inputBase,
        { fontSize: fs(16) },
        {
          backgroundColor,
          borderColor,
          color: textColor,
        },
        style,
      ]}
      placeholderTextColor={placeholderTextColor}
      selectionColor={colors.interaction.primary}
      cursorColor={androidPasswordDarkSurface ? lightColors.text.primary : colors.interaction.primary}
      underlineColorAndroid="transparent"
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      editable={editable}
      secureTextEntry={secureTextEntry}
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

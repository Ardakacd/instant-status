/**
 * Text Primitive Component
 *
 * Components express intention. Screens only assemble them.
 *
 * Variants:
 * - Primary: Titles, status text, names
 * - Secondary: Timestamps, hints, labels
 * - Hint: Subtle guidance text
 *
 * Rules:
 * - No decorative text
 * - No emphasis via color except mint/yellow by role
 * - Typography hierarchy is minimal
 * - Text never draws attention by itself
 */

import React from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';
import { Typography } from '../../design/tokens';
import { useColors } from '../../design';

export type TextVariant = 'primary' | 'secondary' | 'hint';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  children: React.ReactNode;
}

export const Text: React.FC<TextProps> = ({
  variant = 'primary',
  style,
  children,
  allowFontScaling = true,
  ...props
}) => {
  const colors = useColors();
  const variantStyle =
    variant === 'primary'
      ? {
          fontFamily: Typography.fontFamily.medium,
          fontSize: 16,
          lineHeight: 16 * Typography.lineHeight.default,
          color: colors.text.primary,
        }
      : variant === 'secondary'
      ? {
          fontFamily: Typography.fontFamily.regular,
          fontSize: 16,
          lineHeight: 16 * Typography.lineHeight.default,
          color: colors.text.secondary,
        }
      : {
          fontFamily: Typography.fontFamily.regular,
          fontSize: 14,
          lineHeight: 14 * 1.2,
          color: colors.text.secondary,
        };

  return (
    <RNText
      style={[variantStyle, style]}
      allowFontScaling={allowFontScaling}
      {...props}
    >
      {children}
    </RNText>
  );
};

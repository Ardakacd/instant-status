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
import { Text as RNText, TextProps as RNTextProps, StyleSheet } from 'react-native';
import { Colors, Typography } from '../../design';

export type TextVariant = 'primary' | 'secondary' | 'hint';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  children: React.ReactNode;
}

export const Text: React.FC<TextProps> = ({ 
  variant = 'primary', 
  style, 
  children,
  allowFontScaling = true, // Default to true for accessibility, set to false for critical UI elements
  ...props 
}) => {
  return (
    <RNText 
      style={[styles[variant], style]} 
      allowFontScaling={allowFontScaling}
      {...props}
    >
      {children}
    </RNText>
  );
};

const styles = StyleSheet.create({
  primary: {
    // Status text and Names usually need that extra "Medium" weight to feel punchy
    fontFamily: Typography.fontFamily.medium,
    fontSize: 16,
    lineHeight: 16 * Typography.lineHeight.default,
    color: Colors.text.primary,
  },
  secondary: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 16,
    lineHeight: 16 * Typography.lineHeight.default,
    color: Colors.text.secondary,
  },
  hint: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 14,
    // Slightly tighter line height for small hints looks more professional
    lineHeight: 14 * 1.2,
    color: Colors.text.secondary,
  },
});


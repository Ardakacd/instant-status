/**
 * Inline Action Component (Link-like)
 * 
 * Used for:
 * - "Learn about Premium"
 * - "Restore purchase"
 * - Secondary flows
 * 
 * Rules:
 * - No elevation
 * - No haptics
 * - Mint text only
 * - Inline actions never compete with buttons
 */

import React from 'react';
import { TouchableOpacity, TouchableOpacityProps, StyleSheet } from 'react-native';
import { Colors, Typography } from '../../design';
import { Text } from '../primitives/Text';

export interface InlineActionProps extends Omit<TouchableOpacityProps, 'style'> {
  onPress?: () => void;
  children: React.ReactNode;
  style?: TouchableOpacityProps['style'];
  fontSize?: number; // Optional fontSize prop, defaults to 16
}

export const InlineAction: React.FC<InlineActionProps> = ({
  onPress,
  children,
  style,
  disabled,
  fontSize = 16, // Default to 16px
  ...props
}) => {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      disabled={disabled}
      style={[styles.inlineAction, style]}
      {...props}
    >
      <Text
        style={[
          styles.inlineActionText,
          { fontSize }, // Apply fontSize from props
          disabled && styles.disabled,
        ]}
      >
        {children}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  inlineAction: {
    paddingVertical: 2, // Slight vertical padding for a better hit-box
  },
  inlineActionText: {
    // Correctly reference the token key 'regular' which maps to 'Inter-Regular'
    fontFamily: Typography.fontFamily.regular,
    // fontSize is set via props, defaults to 16
    color: Colors.interaction.primary, // Mint text
  },
  disabled: {
    color: Colors.interaction.disabled,
  },
});


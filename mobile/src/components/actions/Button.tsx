/**
 * Button Component
 * 
 * The only way users commit actions.
 * 
 * Variants:
 * - Primary (mint): Set status, confirm actions, primary CTA
 * - Secondary (white + border): Secondary actions
 * - Disabled (soft grey): Unavailable actions
 * 
 * Rules:
 * - Physical offset only for Primary
 * - Haptics only on Primary
 * - Button text is always a verb
 * 
 * Used for:
 * - Sign up
 * - Set status
 * - Add friend
 * - Upgrade
 */

import React, { useState } from 'react';
import { View, TouchableOpacity, TouchableOpacityProps, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors, Borders, Spacing, PhysicalShift } from '../../design';
import { Typography } from '../../design';
import { createPhysicalShiftTransform } from '../../design/styles';
import { Text } from '../primitives/Text';
import { hapticAction } from '../../utils/haptics';

export type ButtonVariant = 'primary' | 'secondary' | 'disabled';

export interface ButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  variant?: ButtonVariant;
  onPress?: () => void;
  loading?: boolean;
  children: React.ReactNode;
  style?: TouchableOpacityProps['style'];
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  onPress,
  loading = false,
  children,
  disabled,
  style,
  ...props
}) => {
  const isDisabled = disabled || loading || variant === 'disabled';
  const [isPressed, setIsPressed] = useState(false); // Track press state for mechanical feel

  const handlePress = () => {
    if (isDisabled || !onPress) return;

    // Haptics only on Primary variant (medium strength for actions)
    if (variant === 'primary') {
      hapticAction();
    }

    onPress();
  };

  // Primary button with physical shift uses two-layer effect
  if (variant === 'primary' && !isDisabled) {
    return (
      <View style={styles.primaryWrapper}>
        {/* Static shadow block (background layer) */}
        <View style={styles.shadowBlock} />
        {/* Moving foreground (actual button) */}
        <TouchableOpacity
          activeOpacity={1} // Set to 1 so the shift does the work, not a fade
          onPressIn={() => setIsPressed(true)} // Shift "down" to cover shadow
          onPressOut={() => setIsPressed(false)} // Snap back "up"
          onPress={handlePress}
          disabled={isDisabled}
          style={[
            styles.button,
            styles[variant],
            createPhysicalShiftTransform(isPressed), // Toggle based on press state
            style,
          ]}
          {...props}
        >
          {loading ? (
            <ActivityIndicator size="small" color={Colors.text.primary} />
          ) : (
            <Text
              variant="primary"
              style={[styles.buttonText, styles.primaryText]}
            >
              {children}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // Secondary and disabled buttons - no physical shift
  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={handlePress}
      disabled={isDisabled}
      style={[
        styles.button,
        styles[variant],
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? Colors.text.primary : Colors.text.primary} />
      ) : (
        <Text
          variant={variant === 'primary' ? 'primary' : 'secondary'}
          style={[
            styles.buttonText,
            variant === 'primary' && styles.primaryText,
            variant === 'secondary' && styles.secondaryText,
            variant === 'disabled' && styles.disabledText,
          ]}
        >
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: Borders.radius.medium,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primary: {
    backgroundColor: Colors.interaction.primary,
  },
  secondary: {
    backgroundColor: Colors.canvas.background,
    borderWidth: Borders.width,
    borderColor: Colors.text.secondary,
  },
  disabled: {
    backgroundColor: Colors.interaction.disabled,
  },
  primaryWrapper: {
    // Wrapper for two-layer physical shift effect on primary buttons
    marginBottom: PhysicalShift.offset.y,
    marginRight: PhysicalShift.offset.x,
  },
  shadowBlock: {
    // Static shadow block (background layer) - stays in place
    position: 'absolute',
    top: PhysicalShift.offset.y,
    left: PhysicalShift.offset.x,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.text.primary, // Charcoal shadow
    borderRadius: Borders.radius.medium,
  },
  buttonText: {
    fontFamily: Typography.fontFamily.medium, // CTA uses medium weight (500)
    fontSize: 16,
  },
  primaryText: {
    // Charcoal text on mint background for better contrast (especially on AMOLED screens)
    color: Colors.text.primary,
  },
  secondaryText: {
    color: Colors.text.primary,
  },
  disabledText: {
    color: Colors.text.secondary,
  },
});


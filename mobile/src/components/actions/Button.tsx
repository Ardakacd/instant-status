/**
 * Button Component
 *
 * Variants:
 * - Primary: Mint bg, opacity feedback on press
 * - Secondary: White + border, opacity feedback on press
 * - Disabled: Grey, no interaction
 */

import React, { useCallback, forwardRef } from "react";
import {
  StyleSheet,
  View,
  Platform,
  Pressable,
  ActivityIndicator,
  type ViewStyle,
} from "react-native";
import { Colors, Borders, Spacing, Typography, useResponsive } from "../../design";
import { Text as DesignText } from "../primitives/Text";
import { hapticAction } from "../../utils/haptics";

const isIOS = Platform.OS === "ios";

export type ButtonVariant = "primary" | "secondary" | "disabled";

export interface ButtonProps {
  variant?: ButtonVariant;
  onPress?: () => void;
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
}

export const Button = forwardRef<View, ButtonProps>(
  (
    {
      variant = "primary",
      onPress,
      children,
      loading = false,
      disabled = false,
      style,
      fullWidth = true,
    },
    ref
  ) => {
    const { fs } = useResponsive();
    const isDisabled = disabled || loading || variant === "disabled";

    const handlePressIn = useCallback(() => {
      if (!isDisabled && variant === "primary") {
        hapticAction();
      }
    }, [isDisabled, variant]);

    const handlePress = useCallback(() => {
      if (isDisabled || !onPress) return;
      onPress();
    }, [isDisabled, onPress]);

    const backgroundColor =
      variant === "primary"
        ? Colors.interaction.primary
        : variant === "secondary"
          ? Colors.canvas.background
          : Colors.interaction.disabled;

    const borderColor =
      variant === "secondary"
        ? Colors.text.secondary
        : Colors.interaction.disabled;

    const hasBorder = variant !== "primary";

    const textColor =
      variant === "primary"
        ? Colors.text.primary
        : variant === "secondary"
          ? Colors.text.primary
          : Colors.text.secondary;

    return (
      <Pressable
        ref={ref as any}
        onPress={handlePress}
        onPressIn={handlePressIn}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.button,
          isIOS && styles.iosBorderCurve,
          fullWidth && styles.fullWidth,
          {
            minHeight: 48,
            paddingVertical: Spacing.md,
            paddingHorizontal: Spacing.lg,
            borderRadius: Borders.radius.medium,
            backgroundColor,
            ...(hasBorder && {
              borderWidth: Borders.width,
              borderColor,
            }),
            opacity: isDisabled ? 0.6 : pressed ? 0.75 : 1,
          },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={textColor} />
        ) : (
          <DesignText
            variant={variant === "primary" ? "primary" : "secondary"}
            style={[styles.buttonText, { color: textColor, fontSize: fs(16) }]}
          >
            {children}
          </DesignText>
        )}
      </Pressable>
    );
  }
);

Button.displayName = "Button";

const styles = StyleSheet.create({
  fullWidth: {
    width: "100%",
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  iosBorderCurve: {
    borderCurve: "continuous" as any,
  },
  buttonText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 16,
  },
});

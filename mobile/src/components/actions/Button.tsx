/**
 * Button Component
 *
 * Neobrutalist-style button with shadow layer and spring press animation.
 * Based on AnimatedButton structure; no icon support.
 *
 * Variants:
 * - Primary: Mint bg, charcoal shadow, spring press
 * - Secondary: White + border, no shadow
 * - Disabled: Grey, no animation
 */

import React, { useCallback, useRef, forwardRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  Platform,
  Animated,
  Pressable,
  ActivityIndicator,
  type ViewStyle,
} from "react-native";
import { Colors, Borders, Spacing, PhysicalShift, Typography } from "../../design";
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
    const isDisabled = disabled || loading || variant === "disabled";
    const pressX = useRef(new Animated.Value(0)).current;
    const pressY = useRef(new Animated.Value(0)).current;

    const handlePressIn = useCallback(() => {
      if (isDisabled) return;
      if (variant === "primary") {
        hapticAction();
        Animated.parallel([
          Animated.spring(pressX, {
            toValue: PhysicalShift.offset.x,
            stiffness: 300,
            damping: 20,
            mass: 0.4,
            useNativeDriver: true,
          }),
          Animated.spring(pressY, {
            toValue: PhysicalShift.offset.y,
            stiffness: 300,
            damping: 20,
            mass: 0.4,
            useNativeDriver: true,
          }),
        ]).start();
      }
    }, [isDisabled, variant]);

    const handlePressOut = useCallback(() => {
      if (isDisabled) return;
      if (variant === "primary") {
        Animated.parallel([
          Animated.spring(pressX, {
            toValue: 0,
            stiffness: 300,
            damping: 20,
            mass: 0.4,
            useNativeDriver: true,
          }),
          Animated.spring(pressY, {
            toValue: 0,
            stiffness: 300,
            damping: 20,
            mass: 0.4,
            useNativeDriver: true,
          }),
        ]).start();
      }
    }, [isDisabled, variant]);

    const handlePress = useCallback(() => {
      if (isDisabled || !onPress) return;
      onPress();
    }, [isDisabled, onPress]);

    const isPrimaryWithShadow = variant === "primary" && !isDisabled;

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

    const spinnerColor = textColor;

    if (isPrimaryWithShadow) {
      return (
        <View
          ref={ref}
          style={[
            styles.container,
            fullWidth && styles.fullWidth,
            styles.primaryWrapper,
            style,
          ]}
        >
          <View
            pointerEvents="none"
            style={[
              styles.shadowLayer,
              {
                top: PhysicalShift.offset.y,
                left: PhysicalShift.offset.x,
                borderRadius: Borders.radius.medium,
                backgroundColor: Colors.text.primary,
              },
            ]}
          />
          <Pressable
            onPress={handlePress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={isDisabled}
            style={styles.pressable}
          >
            <Animated.View
              style={[
                styles.button,
                isIOS && styles.iosBorderCurve,
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
                  transform: [
                    { translateX: pressX },
                    { translateY: pressY },
                  ],
                },
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={spinnerColor} />
              ) : (
                <DesignText
                  variant="primary"
                  style={[styles.buttonText, { color: textColor }]}
                >
                  {children}
                </DesignText>
              )}
            </Animated.View>
          </Pressable>
        </View>
      );
    }

    return (
      <Pressable
        ref={ref as any}
        onPress={handlePress}
        disabled={isDisabled}
        style={[
          styles.container,
          fullWidth && styles.fullWidth,
          styles.button,
          isIOS && styles.iosBorderCurve,
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
          },
          (disabled || loading) && styles.disabledOpacity,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={spinnerColor} />
        ) : (
          <DesignText
            variant={variant === "primary" ? "primary" : "secondary"}
            style={[styles.buttonText, { color: textColor }]}
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
  container: {
    position: "relative",
  },
  fullWidth: {
    width: "100%",
  },
  primaryWrapper: {
    marginBottom: PhysicalShift.offset.y,
    marginRight: PhysicalShift.offset.x,
  },
  shadowLayer: {
    position: "absolute",
    left: PhysicalShift.offset.x,
    right: 0,
    bottom: 0,
  },
  pressable: {
    width: "100%",
    position: "relative",
    zIndex: 3,
  },
  button: {
    width: "100%",
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
  disabledOpacity: {
    opacity: 0.6,
  },
});

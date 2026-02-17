/**
 * Color Picker Component (Full Palette)
 *
 * Rules:
 * - 4-column grid for thumb reachability
 * - Selected state uses thick charcoal border
 * - Charcoal checkmark for maximum contrast
 */

import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Borders, Spacing } from "../design";

interface ColorPickerProps {
  selectedColor: string;
  onSelect: (color: string) => void;
}

const COLOR_PALETTE = [
  { hex: "#EF4444", name: "Red" },
  { hex: "#F59E0B", name: "Orange" },
  { hex: "#EAB308", name: "Yellow" },
  { hex: "#10B981", name: "Green" },
  { hex: "#06B6D4", name: "Cyan" },
  { hex: "#3B82F6", name: "Blue" },
  { hex: "#6366F1", name: "Indigo" },
  { hex: "#8B5CF6", name: "Purple" },
  { hex: "#EC4899", name: "Pink" },
  { hex: "#F43F5E", name: "Rose" },
  { hex: "#84CC16", name: "Lime" },
  { hex: "#14B8A6", name: "Teal" },
];

export const ColorPicker: React.FC<ColorPickerProps> = ({
  selectedColor,
  onSelect,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.colorGrid}>
        {COLOR_PALETTE.map((color) => {
          const isSelected =
            selectedColor.toUpperCase() === color.hex.toUpperCase();

          return (
            <TouchableOpacity
              key={color.hex}
              style={[
                styles.colorButton,
                { backgroundColor: color.hex },
                isSelected && styles.colorButtonSelected,
              ]}
              onPress={() => onSelect(color.hex)}
              activeOpacity={1}
            >
              {isSelected && (
                <Ionicons
                  name="checkmark"
                  size={24}
                  color={Colors.text.primary} // High-contrast charcoal
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.md,
    alignItems: "center",
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
    justifyContent: "space-between", // Even spacing for the grid
    gap: 12,
  },
  colorButton: {
    width: 60, // Larger touch target for the A15 screen
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1, // Subtle border for non-selected
    borderColor: "rgba(0,0,0,0.05)",
  },
  colorButtonSelected: {
    borderWidth: Borders.width, // Thick 2px Neobrutalist border
    borderColor: Colors.text.primary,
  },
});

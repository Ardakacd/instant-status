import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface ColorPickerProps {
  selectedColor: string;
  onSelect: (color: string) => void;
}

// Curated color palette - colors that work well with white text
const COLOR_PALETTE = [
  { hex: "#EF4444", name: "Red" },      // Red
  { hex: "#F59E0B", name: "Orange" },   // Orange
  { hex: "#EAB308", name: "Yellow" },   // Yellow
  { hex: "#10B981", name: "Green" },    // Green
  { hex: "#06B6D4", name: "Cyan" },     // Cyan
  { hex: "#3B82F6", name: "Blue" },     // Blue
  { hex: "#6366F1", name: "Indigo" },   // Indigo
  { hex: "#8B5CF6", name: "Purple" },   // Purple
  { hex: "#EC4899", name: "Pink" },     // Pink
  { hex: "#F43F5E", name: "Rose" },      // Rose
  { hex: "#84CC16", name: "Lime" },      // Lime
  { hex: "#14B8A6", name: "Teal" },      // Teal
];

export default function ColorPicker({ selectedColor, onSelect }: ColorPickerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.colorGrid}>
        {COLOR_PALETTE.map((color) => (
          <TouchableOpacity
            key={color.hex}
            style={[
              styles.colorButton,
              { backgroundColor: color.hex },
              selectedColor.toUpperCase() === color.hex.toUpperCase() &&
                styles.colorButtonSelected,
            ]}
            onPress={() => onSelect(color.hex)}
            activeOpacity={0.8}
          >
            {selectedColor.toUpperCase() === color.hex.toUpperCase() && (
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  colorButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  colorButtonSelected: {
    borderColor: "#FFFFFF",
    transform: [{ scale: 1.1 }],
  },
});


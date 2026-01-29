import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";

interface EmojiPickerProps {
  selectedEmoji: string;
  onSelect: (emoji: string) => void;
}

// Curated list of commonly used emojis for status
const EMOJI_CATEGORIES = {
  "Common": ["🟢", "🟠", "🔴", "🟣", "🔵", "🩷", "💚", "🧡", "❤️", "💜", "💙", "💖"],
  "Activities": ["🎯", "💼", "📚", "🎨", "🎵", "🎮", "⚽", "🏃", "🧘", "🍕", "☕", "🍔"],
  "Moods": ["😊", "😴", "🤔", "😎", "🥳", "😤", "😌", "🤯", "😍", "🤗", "🙄", "😅"],
  "Objects": ["📱", "💻", "🚗", "✈️", "🏠", "🏢", "🎪", "🎭", "📞", "📧", "📺", "🎬"],
  "Symbols": ["✓", "✗", "!", "?", "⭐", "🔥", "💡", "⚡", "🌟", "✨", "🎉", "🎊"],
};

export default function EmojiPicker({ selectedEmoji, onSelect }: EmojiPickerProps) {
  return (
    <View style={styles.container}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
          <View key={category} style={styles.category}>
            {emojis.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={[
                  styles.emojiButton,
                  selectedEmoji === emoji && styles.emojiButtonSelected,
                ]}
                onPress={() => onSelect(emoji)}
                activeOpacity={0.7}
              >
                <Text style={styles.emoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  scrollContent: {
    paddingVertical: 8,
    gap: 16,
  },
  category: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 4,
  },
  emojiButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  emojiButtonSelected: {
    backgroundColor: "#EFF6FF",
    borderColor: "#007AFF",
  },
  emoji: {
    fontSize: 24,
  },
});

